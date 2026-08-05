/* ============================================================
   Karşılama paneli — canlı uçuş durumu (AYT — antalya-airport.aero)
   Cloudflare Worker — ramosnjttransfer.com'daki VPS'e HİÇ dokunmaz,
   tamamen bağımsız çalışır.

   Kullanım (tek uçuş):  GET /?code=TK1234
   Kullanım (toplu):     GET /?codes=TK1234,XQ199,DK776
   Saat ipucuyla (gecikme hesabı rezervasyondaki beklenen saate göre yapılır):
                         GET /?codes=XQ571@14:25,TK1234@10:00
   Toplu yanıt: { "XQ571": {...}, "TK1234": {...} }

   Kaynak: antalya-airport.aero (AYT) — yer hizmetlerinin girdiği gerçek
   "İndi / Bagaj Bantta / Son Bagaj / Belt Kapandı" durumları, ücretsiz.
   Sayfanın kendi "Daha fazla" postback'i simüle edilerek varsayılan ~50
   satırlık pencere ~340 satıra (kabaca bugün+yarın) genişletiliyor — bkz.
   fetchAytArrivals(). AYT yine de bir uçuşu bu genişletilmiş pencereden
   düşürürse, o uçuşun son gerçek durumu "yapışkan" bir önbellekte 12 saat
   daha hatırlanır — böylece uçuş listeden kalksa bile kaybolmaz.

   Deploy:
     1) https://dash.cloudflare.com → Workers & Pages → ilgili Worker
     2) "Edit code" → buradaki tüm içeriği yapıştır → Deploy
     3) Çıkan URL'yi app.js'teki FLIGHT_STATUS_API değişkenine yaz
   ============================================================ */

const AYT_URL = 'https://www.antalya-airport.aero/yolcu-ve-ziyaretciler/ucus-bilgileri/tum-hatlar-gelis';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const AYT_LANDED_STATUSES = ['İndi', 'Son Bagaj', 'Bagaj Bantta', 'Belt Kapandı'];

const CACHE_TTL = 90; // genel sonuç — AYT'ye gereğinden fazla istek gitmesin
const AYT_STICKY_TTL = 43200; // AYT bir uçuşu listeden düşürse bile son gerçek durumunu (ör. Belt Kapandı) 12 saat "yapışkan" tutar

const MAX_BATCH_ENTRIES = 40; // Cloudflare Worker'ın alt-istek sınırını (50) aşmamak için tek istekte üst sınır

function normalizeCode(code) {
  const m = /^([A-Za-z]+)0*(\d+)$/.exec((code || '').trim());
  return m ? (m[1].toUpperCase() + parseInt(m[2], 10)) : (code || '').toUpperCase();
}

/* "14:25" -> gece yarısından itibaren dakika (sadece saat karşılaştırması için) */
function timeStrToMinutes(s) {
  const m = /^(\d{1,2}):(\d{2})/.exec((s || '').trim());
  if (!m) return null;
  return (+m[1]) * 60 + (+m[2]);
}

/* ════ ANTALYA HAVALİMANI (antalya-airport.aero) ════
   Yer hizmetlerinin girdiği gerçek "İndi / Son Bagaj / Bagaj Bantta / Belt
   Kapandı" durumları var. Düz HTML, oturum/ViewState gerekmiyor — tek GET
   isteğiyle günün tüm gelişleri geliyor. */
function todayDMY() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear();
}

function parseAytArrivals(html) {
  const rows = [];
  const rowRegex = /<tr class="status_[A-Za-z0-9]+">([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRegex.exec(html))) {
    const row = m[1];
    const get = (re) => { const mm = re.exec(row); return mm ? mm[1].trim() : ''; };
    /* AYT zebra-çizgili satırlarda class'a ekstra "withbg" ekliyor
       (ör. class="flightnum withbg") — [^"]* ile esnek eşleştirilmezse
       satırların yarısı (withbg'li olanlar) tamamen atlanıyordu. */
    const flightNum = get(/<td class="flightnum[^"]*"><span>([^<]+)<\/span><\/td>/);
    const airline = get(/<td class="airline[^"]*"[^>]*title="([^"]+)"/);
    const from = get(/<td class="from[^"]*"><span>([^<]*)<\/span><\/td>/);
    const scheduled = get(/<td class="time scheduled[^"]*"><span>([^<]*)<\/span><\/td>/);
    const estimated = get(/<td class="time estimated[^"]*"><span>([^<]*)<\/span><\/td>/);
    const belt = get(/<td class="belt[^"]*"><span>([^<]*)<\/span><\/td>/);
    const terminal = get(/<td class="terminal[^"]*"><span>([^<]*)<\/span><\/td>/);
    const status = get(/<td class="status[^"]*"><span>([^<]*)<\/span><\/td>/);

    const codeMatch = /^([A-Za-z0-9]{2})\/[A-Za-z0-9]+\s*(\d+)$/.exec(flightNum);
    const code = codeMatch ? (codeMatch[1].toUpperCase() + parseInt(codeMatch[2], 10)) : '';
    if (code) rows.push({ code, airline, from, scheduled, estimated, belt, terminal, status });
  }
  return rows;
}

/* AYT'nin sayfası Telerik RadAjax (ASP.NET WebForms) ile yazılmış: varsayılan
   görünüm sadece ~50 satır gösteriyor, ekranın altındaki "Daha fazla" linki
   bir postback ile ~340 satıra kadar genişletiyor (yaklaşık bugün+yarın).
   Bu, sayfanın kendi "Daha fazla" tıklamasının birebir aynısı — session/
   cookie gerekmiyor, ViewState'in kendisi durumu taşıyor: tek bir GET ile
   forma ait gizli alanları okuyup aynı POST'u tekrar gönderiyoruz. */
function extractHiddenField(html, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let re = new RegExp('name="' + esc + '"[^>]*value="([^"]*)"');
  let m = re.exec(html);
  if (m) return m[1];
  re = new RegExp('value="([^"]*)"[^>]*name="' + esc + '"');
  m = re.exec(html);
  return m ? m[1] : '';
}

const AYT_LOADMORE_FIELDS = [
  '__VIEWSTATE', '__VIEWSTATEGENERATOR', '__VIEWSTATEENCRYPTED', '__EVENTVALIDATION',
  'RadStyleSheetManager1_TSSM', 'RadScriptManager1_TSM',
  'ctl00_ctl00_RadFormDecorator_Main_ClientState',
  'MobileMenu_ClientState',
  'ctl00$ctl00$ContentPlaceHolder_ForNested$ContentPlaceHolder_ForNested$RadTextBox_Keywords',
  'ctl00_ctl00_ContentPlaceHolder_ForNested_ContentPlaceHolder_ForNested_RadTextBox_Keywords_ClientState',
  'ctl00$ctl00$ContentPlaceHolder_ForNested$ContentPlaceHolder_ForNested$RadDateTimePicker_Start',
  'ctl00$ctl00$ContentPlaceHolder_ForNested$ContentPlaceHolder_ForNested$RadDateTimePicker_Start$dateInput',
  'ctl00_ctl00_ContentPlaceHolder_ForNested_ContentPlaceHolder_ForNested_RadDateTimePicker_Start_calendar_SD',
  'ctl00_ctl00_ContentPlaceHolder_ForNested_ContentPlaceHolder_ForNested_RadDateTimePicker_Start_calendar_AD',
  'ctl00_ctl00_ContentPlaceHolder_ForNested_ContentPlaceHolder_ForNested_RadDateTimePicker_Start_timeView_ClientState',
  'ctl00_ctl00_ContentPlaceHolder_ForNested_ContentPlaceHolder_ForNested_RadDateTimePicker_Start_dateInput_ClientState',
  'ctl00_ctl00_ContentPlaceHolder_ForNested_ContentPlaceHolder_ForNested_RadDateTimePicker_Start_ClientState',
  'ctl00$ctl00$ContentPlaceHolder_ForNested$ContentPlaceHolder_ForNested$RadDateTimePicker_End',
  'ctl00$ctl00$ContentPlaceHolder_ForNested$ContentPlaceHolder_ForNested$RadDateTimePicker_End$dateInput',
  'ctl00_ctl00_ContentPlaceHolder_ForNested_ContentPlaceHolder_ForNested_RadDateTimePicker_End_calendar_SD',
  'ctl00_ctl00_ContentPlaceHolder_ForNested_ContentPlaceHolder_ForNested_RadDateTimePicker_End_calendar_AD',
  'ctl00_ctl00_ContentPlaceHolder_ForNested_ContentPlaceHolder_ForNested_RadDateTimePicker_End_timeView_ClientState',
  'ctl00_ctl00_ContentPlaceHolder_ForNested_ContentPlaceHolder_ForNested_RadDateTimePicker_End_dateInput_ClientState',
  'ctl00_ctl00_ContentPlaceHolder_ForNested_ContentPlaceHolder_ForNested_RadDateTimePicker_End_ClientState',
  'ctl00$ctl00$ContentPlaceHolder_ForNested$ContentPlaceHolder_ForNested$RadComboBox_Terminal',
  'ctl00_ctl00_ContentPlaceHolder_ForNested_ContentPlaceHolder_ForNested_RadComboBox_Terminal_ClientState',
];
const AYT_LOADMORE_EVENT_TARGET = 'ctl00$ctl00$ContentPlaceHolder_ForNested$ContentPlaceHolder_ForNested$LinkButton_More';
const AYT_LOADMORE_AJAX_PANEL =
  'ctl00$ctl00$ContentPlaceHolder_ForNested$ContentPlaceHolder_ForNested$ctl00$ctl00$ContentPlaceHolder_ForNested$ContentPlaceHolder_ForNested$RadAjaxPanel1Panel';

async function fetchAytArrivals() {
  const res1 = await fetch(AYT_URL, { headers: { 'User-Agent': BROWSER_UA } });
  if (!res1.ok) return [];
  const html1 = await res1.text();
  const base = parseAytArrivals(html1); // "Daha fazla" postback'i başarısız olursa en azından bu 50 satır döner

  try {
    const body = new URLSearchParams();
    body.set('ctl00$ctl00$RadScriptManager1', AYT_LOADMORE_AJAX_PANEL + '|' + AYT_LOADMORE_EVENT_TARGET);
    for (const name of AYT_LOADMORE_FIELDS) body.set(name, extractHiddenField(html1, name));
    body.set('__EVENTTARGET', AYT_LOADMORE_EVENT_TARGET);
    body.set('__EVENTARGUMENT', '');
    body.set('__ASYNCPOST', 'true');
    body.set('RadAJAXControlID', '');

    const res2 = await fetch(AYT_URL, {
      method: 'POST',
      headers: {
        'User-Agent': BROWSER_UA,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-MicrosoftAjax': 'Delta=true',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: body.toString(),
    });
    if (!res2.ok) return base;
    const html2 = await res2.text();
    const expanded = parseAytArrivals(html2);
    return expanded.length >= base.length ? expanded : base;
  } catch (e) {
    return base; // "Daha fazla" simülasyonu bozulursa (AYT sayfa yapısı değişirse vb.) sessizce ilk 50 satıra düş
  }
}

function buildResultFromAyt(row) {
  const dmy = todayDMY();
  const schedMin = timeStrToMinutes(row.scheduled);
  const estMin = timeStrToMinutes(row.estimated);
  const landed = AYT_LANDED_STATUSES.indexOf(row.status) > -1;
  const delayMin = (schedMin != null && estMin != null) ? Math.round(estMin - schedMin) : 0;

  const base = {
    havayolu: row.airline || '',
    ucakTipi: '',
    kalkisSehir: row.from || '',
    varisSehir: 'Antalya',
    kalkisIata: '',
    varisIata: 'AYT',
    kapi: '',
    terminal: row.terminal || '',
    bagajBandi: row.belt || '',
    planlananVaris: row.scheduled ? (dmy + ' ' + row.scheduled + ':00') : '',
    tahminiVaris: row.estimated ? (dmy + ' ' + row.estimated + ':00') : '',
    gercekVaris: (landed && row.estimated) ? (dmy + ' ' + row.estimated + ':00') : '',
    ucakFoto: '', havayoluLogo: '',
    lat: null, lon: null, irtifa: null, rota: [],
    aytDurum: row.status || '',
    kaynak: 'ayt',
    eslesmeYontemi: 'kod',
  };

  /* AYT'nin ham row.status metnini SADECE bilinen, okunaklı yer-hizmetleri
     durumlarında ("İndi", "Bagaj Bantta" vb.) ekrana basıyoruz. Uçak henüz
     inmemişken AYT bazen "Gecikme:05:31" gibi çiğ/teknik bir kod dönüyor —
     onu olduğu gibi göstermek yerine sade "X dk gecikti" metnine düşüyoruz. */
  const durumMetinKaynagi = landed ? row.status : '';

  if (delayMin > 5) {
    return Object.assign({
      ucusDurum: 'gecikti',
      ucusDurumMetin: durumMetinKaynagi ? durumMetinKaynagi + ' · ' + delayMin + ' dk gecikti' : (delayMin + ' dk gecikti'),
      ucusGecikmeDk: delayMin,
    }, base);
  }
  return Object.assign({
    ucusDurum: 'zamaninda',
    ucusDurumMetin: durumMetinKaynagi || 'Zamanında',
    ucusGecikmeDk: 0,
  }, base);
}

const AYT_NUMBER_TIME_TOLERANCE_MIN = 20; // numara+saat ile yapılan yaklaşık eşleştirmede kabul edilen fark

function numericPart(code) {
  const m = /(\d+)$/.exec((code || '').trim());
  return m ? parseInt(m[1], 10) : null;
}

/* Rezervasyon sistemindeki kod AYT'de birebir bulunamazsa (ör. bir havayolu
   için "STW198" girilmiş ama AYT bu uçuşu "2S/STW 198" yani IATA kodu "2S"
   ile listeliyorsa) havayolu ön ekine bakmadan SADECE uçuş numarasına göre
   AYT'nin tüm satırları taranır; planlanan saati rezervasyondaki beklenen
   saate en yakın olan (ve toleransın içinde kalan) satır kullanılır. Bu,
   havayolu kodu uyuşmazlıklarını otomatik olarak çözer. */
function findAytByNumberAndTime(aytRows, code, expectedMin) {
  if (expectedMin == null) return null;
  const num = numericPart(code);
  if (num == null) return null;

  let best = null;
  let bestDiff = Infinity;
  for (const row of aytRows) {
    if (numericPart(row.code) !== num) continue;
    const schedMin = timeStrToMinutes(row.scheduled);
    if (schedMin == null) continue;
    const diff = Math.abs(schedMin - expectedMin);
    if (diff < bestDiff) { bestDiff = diff; best = row; }
  }
  return (best && bestDiff <= AYT_NUMBER_TIME_TOLERANCE_MIN) ? best : null;
}

/* codes: [{code, expectedMin}] — AYT tek seferde çekilip hepsiyle eşleştirilir.

   İki ayrı önbellek katmanı var, birbirine KARIŞTIRILMAMALI:
   1) Genel SONUÇ önbelleği (cacheKeys) — kısa TTL (CACHE_TTL). Sadece art
      arda gelen client anketlerinde AYT'yi tekrar tekrar çekmemek için.
   2) AYT "yapışkan son durum" önbelleği — uzun TTL (AYT_STICKY_TTL). AYT bir
      uçuşu rolling window'dan düşürdüğünde (uçuş süreci bitip listeden
      kalktığında) son gerçek durumunu (ör. "Belt Kapandı") kaybetmeyelim
      diye; taze AYT satırı geldikçe üzerine yazılır, AYT sessiz kaldığında
      bu kullanılır — uçuş bulunamadı diye boşa düşmez. */
async function resolveCodes(entries, cache, origin) {
  const result = {};
  const uncached = [];
  const cacheKeys = {};

  for (const entry of entries) {
    const key = new Request(origin + '/cache/v4/' + normalizeCode(entry.code));
    cacheKeys[entry.code] = key;
    const hit = await cache.match(key);
    if (hit) {
      result[entry.code] = await hit.json();
    } else {
      uncached.push(entry);
    }
  }

  if (uncached.length) {
    const aytRows = await fetchAytArrivals().catch(() => []);
    const aytByCode = new Map();
    aytRows.forEach((r) => { const k = normalizeCode(r.code); if (!aytByCode.has(k)) aytByCode.set(k, r); });

    /* Her kod TAMAMEN bağımsız try/catch içinde — biri patlarsa diğerlerini
       (Promise.all reject edip TÜM toplu isteği etkileyerek) bozmasın. */
    await Promise.all(uncached.map(async (entry) => {
      const code = entry.code;
      const norm = normalizeCode(code);
      let value = { ucusDurum: null };
      let freshAytRow = null;

      try {
        freshAytRow = aytByCode.get(norm);
        let eslesmeYontemi = 'kod';
        if (!freshAytRow) {
          freshAytRow = findAytByNumberAndTime(aytRows, code, entry.expectedMin);
          eslesmeYontemi = 'sayi-saat'; // havayolu ön eki uyuşmadı, numara+saatle bulundu
        }

        if (freshAytRow) {
          value = buildResultFromAyt(freshAytRow);
          value.eslesmeYontemi = eslesmeYontemi;
        } else {
          const stickyKey = new Request(origin + '/aytsticky/v4/' + norm);
          const stickyHit = await cache.match(stickyKey);
          if (stickyHit) value = await stickyHit.json(); // AYT listeden düşmüş ama son gerçek durumu korunuyor
        }
      } catch (e) { /* değer null kalır, diğer kodları etkilemez */ }

      result[code] = value;

      /* Genel sonuç kısa TTL ile önbelleklenir — AYT bir dahaki döngüde
         mutlaka yeniden kontrol edilsin diye. */
      try {
        const resp = new Response(JSON.stringify(value), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=' + CACHE_TTL },
        });
        await cache.put(cacheKeys[code], resp);
      } catch (e) { /* cache yazılamazsa da sonuç yine döner, sadece önbelleklenmez */ }

      /* Taze bir AYT satırı görüldüyse "yapışkan" önbelleğe de yazılır — AYT
         bu uçuşu sonradan listeden düşürse bile son gerçek durumu uzun süre
         (AYT_STICKY_TTL) saklanır. */
      if (freshAytRow) {
        try {
          const stickyKey = new Request(origin + '/aytsticky/v4/' + norm);
          const resp2 = new Response(JSON.stringify(value), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=' + AYT_STICKY_TTL },
          });
          await cache.put(stickyKey, resp2);
        } catch (e) { /* önbelleklenemezse bir dahaki döngüde tekrar taze AYT'den denenir */ }
      }
    }));
  }

  return result;
}

function parseEntries(param) {
  return param.split(',').map((raw) => {
    var s = raw.trim();
    var at = s.indexOf('@');
    if (at === -1) return { code: s, expectedMin: null };
    return { code: s.slice(0, at), expectedMin: timeStrToMinutes(s.slice(at + 1)) };
  }).filter((e) => e.code).slice(0, MAX_BATCH_ENTRIES); // Cloudflare alt-istek sınırını korumak için üst sınır
}

function withCors(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Cache-Control': 'public, max-age=' + CACHE_TTL,
    },
  });
}

async function handleRequest(request) {
  if (request.method === 'OPTIONS') return withCors({}, 204);

  const url = new URL(request.url);
  const cache = caches.default;

  const codesParam = url.searchParams.get('codes');
  const codeParam = url.searchParams.get('code');
  const debugParam = url.searchParams.get('debug');

  if (debugParam === 'ayt') {
    try {
      const rows = await fetchAytArrivals();
      return withCors({ rowCount: rows.length, sample: rows.slice(0, 3), has2141: rows.some((r) => r.code === 'U22141') });
    } catch (e) {
      return withCors({ error: String(e && e.message || e) }, 500);
    }
  }

  if (codesParam) {
    const entries = parseEntries(codesParam);
    if (!entries.length) return withCors({ error: 'codes parametresi boş' }, 400);
    let result;
    try { result = await resolveCodes(entries, cache, url.origin); }
    catch (e) { result = {}; entries.forEach((en) => { result[en.code] = { ucusDurum: null }; }); }
    return withCors(result);
  }

  if (codeParam) {
    const result = await resolveCodes([{ code: codeParam, expectedMin: null }], cache, url.origin);
    return withCors(result[codeParam] || { ucusDurum: null });
  }

  return withCors({ error: 'code veya codes parametresi zorunlu' }, 400);
}

/* Sabit origin — cron tetikleyicide gerçek bir istek olmadığı için url.origin
   yok; yapışkan önbelleğin anahtarı client isteğindekiyle (url.origin) BİREBİR
   aynı olmalı ki resolveCodes() sonradan bu kaydı bulabilsin. */
const SELF_ORIGIN = 'https://silent-math-b4a9.ramosviptransfer.workers.dev';

/* Cron ile (kimse panele bakmasa bile) periyodik çalışır: AYT'nin o anki
   listesindeki HER satırı yapışkan önbelleğe yazar. Amaç: örn. sabah 06:00'da
   kimse panelde değilken inen bir uçuş, AYT onu rolling window'dan düşürene
   kadar hiç görülmemiş olmasın diye — aksi halde o uçuşun durumu sonsuza kadar
   kaybolurdu (Worker sadece gerçek bir istek geldiğinde çalışır). */
async function scheduledSync() {
  const cache = caches.default;
  const aytRows = await fetchAytArrivals().catch(() => []);
  await Promise.all(aytRows.map(async (row) => {
    const norm = normalizeCode(row.code);
    if (!norm) return;
    try {
      const value = buildResultFromAyt(row);
      const stickyKey = new Request(SELF_ORIGIN + '/aytsticky/v4/' + norm);
      const resp = new Response(JSON.stringify(value), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=' + AYT_STICKY_TTL },
      });
      await cache.put(stickyKey, resp);
    } catch (e) { /* tek satır yazılamazsa diğerlerini etkilemesin */ }
  }));
}

export default {
  async fetch(request) {
    return handleRequest(request);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(scheduledSync());
  },
};
