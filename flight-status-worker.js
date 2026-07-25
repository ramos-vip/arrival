/* ============================================================
   Karşılama paneli — canlı uçuş durumu (AYT + FlightRadar24)
   Cloudflare Worker — ramosnjttransfer.com'daki VPS'e HİÇ dokunmaz,
   tamamen bağımsız çalışır.

   Kullanım (tek uçuş):  GET /?code=TK1234
   Kullanım (toplu):     GET /?codes=TK1234,XQ199,DK776
   Saat ipucuyla (gecikme hesabı rezervasyondaki beklenen saate göre yapılır):
                         GET /?codes=XQ571@14:25,TK1234@10:00
   Toplu yanıt: { "XQ571": {...}, "TK1234": {...} }

   Kaynaklar:
     1) antalya-airport.aero (AYT)  — birincil: bagaj bandı, terminal,
        yer hizmetlerinin girdiği gerçek "İndi/Son Bagaj" durumu, ücretsiz.
     2) FlightRadar24 API (flight-summary/light) — AYT'nin rolling-window'da
        yakalayamadığı uçuşlar için: gerçek kalkış/iniş zamanını doğrudan
        veriyor, DHMI'nin aksine tahmine dayanmıyor. Kredi bazlı ücretli bir
        servis olduğu için mümkün olduğunca az ve hedefli sorgulanır.

   Deploy:
     1) https://dash.cloudflare.com → Workers & Pages → ilgili Worker
     2) Settings → Variables and Secrets → Add → isim: FR24_API_TOKEN,
        değer: FlightRadar24 hesabındaki gerçek (sandbox olmayan) Access
        Token → "Encrypt" → Save and Deploy
     3) "Edit code" → buradaki tüm içeriği yapıştır → Deploy
     4) Çıkan URL'yi app.js'teki FLIGHT_STATUS_API değişkenine yaz
   ============================================================ */

const AYT_URL = 'https://www.antalya-airport.aero/yolcu-ve-ziyaretciler/ucus-bilgileri/tum-hatlar-gelis';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const AYT_LANDED_STATUSES = ['İndi', 'Son Bagaj', 'Bagaj Bantta', 'Belt Kapandı'];

const FR24_BASE = 'https://fr24api.flightradar24.com/api';
const FR24_BATCH_SIZE = 15; // flight-summary "flights" parametresi tek seferde en fazla 15 kod kabul ediyor

const CACHE_TTL = 90; // AYT (ücretsiz) sonuçları için — kaynağa gereğinden fazla istek gitmesin
const FR24_ACTIVE_TTL = 180; // henüz inmemiş/bulunamamış FR24 sonucu — 3 dakikada bir tazele
const FR24_LANDED_TTL = 21600; // inmiş uçuş artık değişmez — 6 saat önbellekte kalsın (kredi tasarrufu)

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

/* ════ ANTALYA HAVALİMANI (antalya-airport.aero) — birincil kaynak ════
   Yer hizmetlerinin girdiği gerçek "İndi / Son Bagaj / Bagaj Bantta" durumları
   var. Düz HTML, oturum/ViewState gerekmiyor — tek GET isteğiyle günün tüm
   gelişleri geliyor. */
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
    const flightNum = get(/<td class="flightnum"><span>([^<]+)<\/span><\/td>/);
    const airline = get(/<td class="airline"[^>]*title="([^"]+)"/);
    const from = get(/<td class="from"><span>([^<]*)<\/span><\/td>/);
    const scheduled = get(/<td class="time scheduled"><span>([^<]*)<\/span><\/td>/);
    const estimated = get(/<td class="time estimated"><span>([^<]*)<\/span><\/td>/);
    const belt = get(/<td class="belt[^"]*"><span>([^<]*)<\/span><\/td>/);
    const terminal = get(/<td class="terminal[^"]*"><span>([^<]*)<\/span><\/td>/);
    const status = get(/<td class="status"><span>([^<]*)<\/span><\/td>/);

    const codeMatch = /^([A-Za-z0-9]{2})\/[A-Za-z0-9]+\s*(\d+)$/.exec(flightNum);
    const code = codeMatch ? (codeMatch[1].toUpperCase() + parseInt(codeMatch[2], 10)) : '';
    if (code) rows.push({ code, airline, from, scheduled, estimated, belt, terminal, status });
  }
  return rows;
}

async function fetchAytArrivals() {
  const res = await fetch(AYT_URL, { headers: { 'User-Agent': BROWSER_UA } });
  if (!res.ok) return [];
  const html = await res.text();
  return parseAytArrivals(html);
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

  if (delayMin > 5) {
    return Object.assign({
      ucusDurum: 'gecikti',
      ucusDurumMetin: row.status ? row.status + ' · ' + delayMin + ' dk gecikti' : (delayMin + ' dk gecikti'),
      ucusGecikmeDk: delayMin,
    }, base);
  }
  return Object.assign({
    ucusDurum: 'zamaninda',
    ucusDurumMetin: row.status || 'Zamanında',
    ucusGecikmeDk: 0,
  }, base);
}

/* ════ FLIGHTRADAR24 (fr24api.flightradar24.com) — ikincil/yedek kaynak ════
   AYT'de bulunamayan uçuşlar için "flight-summary/light" endpoint'i sorgulanır:
   gerçek kalkış/iniş zamanını doğrudan verir (tahmini alan yok, bu yüzden
   gecikme rezervasyondaki beklenen saatle karşılaştırılarak hesaplanır). */

function fr24IsoUtc(msAgo) {
  return new Date(Date.now() - msAgo).toISOString().replace(/\.\d+Z$/, '');
}

async function fr24Fetch(path, env) {
  if (!env || !env.FR24_API_TOKEN) return null;
  const res = await fetch(FR24_BASE + path, {
    headers: {
      'Authorization': 'Bearer ' + env.FR24_API_TOKEN,
      'Accept': 'application/json',
      'Accept-Version': 'v1',
    },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return Array.isArray(json && json.data) ? json.data : null;
}

/* FR24 zamanları UTC — Türkiye sabit UTC+3 (DST yok), +3 saat kaydırıp
   yerel string/dakika üretir. */
function fr24DateToTR(iso) {
  if (!iso) return null;
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  if (isNaN(d.getTime())) return null;
  return new Date(d.getTime() + 3 * 60 * 60 * 1000);
}

function fr24DateToTRString(iso) {
  const tr = fr24DateToTR(iso);
  if (!tr) return '';
  const p = (n) => String(n).padStart(2, '0');
  return p(tr.getUTCDate()) + '.' + p(tr.getUTCMonth() + 1) + '.' + tr.getUTCFullYear() + ' ' +
    p(tr.getUTCHours()) + ':' + p(tr.getUTCMinutes()) + ':' + p(tr.getUTCSeconds());
}

function fr24MinutesOfDay(iso) {
  const tr = fr24DateToTR(iso);
  return tr ? (tr.getUTCHours() * 60 + tr.getUTCMinutes()) : null;
}

/* expectedMin (rezervasyondaki beklenen saat) varsa "Planlanan" kartı için
   bugünün tarihiyle birleştirip aynı string formatını (dd.mm.yyyy HH:MM:00)
   üretir — FR24 bunu vermediği için elimizdeki tek planlanan saat bu. */
function planFromExpectedMin(expectedMin) {
  if (expectedMin == null) return '';
  const dmy = todayDMY();
  const p = (n) => String(n).padStart(2, '0');
  return dmy + ' ' + p(Math.floor(expectedMin / 60)) + ':' + p(expectedMin % 60) + ':00';
}

function buildResultFromFr24(rec, expectedMin) {
  const landed = !!(rec.flight_ended && rec.datetime_landed);

  const base = {
    havayolu: rec.operated_as || rec.painted_as || '',
    ucakTipi: rec.type || '',
    kalkisSehir: '', // FR24 sadece ICAO kodu veriyor, şehir adı yok — kalkisIata'da gösterilir
    varisSehir: 'Antalya',
    kalkisIata: rec.orig_icao || '',
    varisIata: 'AYT',
    kapi: '', terminal: '', bagajBandi: '', // FR24 bu bilgileri vermiyor — AYT'nin işi
    planlananVaris: planFromExpectedMin(expectedMin), // FR24 planlanan/tahmini saat vermiyor, elimizdeki rezervasyon saatini kullanırız
    tahminiVaris: '',
    gercekVaris: landed ? fr24DateToTRString(rec.datetime_landed) : '',
    ucakFoto: '', havayoluLogo: '',
    lat: null, lon: null, irtifa: null, rota: [],
    kaynak: 'fr24',
    eslesmeYontemi: 'kod',
  };

  if (!landed) {
    return Object.assign({ ucusDurum: 'zamaninda', ucusDurumMetin: 'Havada', ucusGecikmeDk: 0 }, base);
  }

  let delayMin = 0;
  if (expectedMin != null) {
    const landedMin = fr24MinutesOfDay(rec.datetime_landed);
    if (landedMin != null) delayMin = Math.round(landedMin - expectedMin);
  }

  if (delayMin > 5) {
    return Object.assign({
      ucusDurum: 'gecikti',
      ucusDurumMetin: 'İndi · ' + delayMin + ' dk gecikti',
      ucusGecikmeDk: delayMin,
    }, base);
  }
  return Object.assign({ ucusDurum: 'zamaninda', ucusDurumMetin: 'İndi', ucusGecikmeDk: 0 }, base);
}

/* entries: [{code, expectedMin}] — SADECE AYT'de bulunamayanlar için çağrılır.
   flight-summary/light tek seferde en fazla 15 kod kabul ediyor, gerekirse
   birden fazla gruba bölünür. Kredi maliyetini düşük tutmak için sadece son
   24 saatlik pencere sorgulanır (uzun menzilli uçuşlarda kalkış bir önceki
   güne sarkabildiği için "bugün 00:00" yerine kayan pencere kullanılır). */
async function fetchFr24Summary(entries, env) {
  const byCode = new Map();
  if (!entries.length) return byCode;

  const from = fr24IsoUtc(24 * 60 * 60 * 1000);
  const to = fr24IsoUtc(0);

  for (let i = 0; i < entries.length; i += FR24_BATCH_SIZE) {
    const group = entries.slice(i, i + FR24_BATCH_SIZE);
    const flightsParam = group.map((e) => normalizeCode(e.code)).join(',');
    const path = '/flight-summary/light?flights=' + encodeURIComponent(flightsParam) +
      '&flight_datetime_from=' + encodeURIComponent(from) +
      '&flight_datetime_to=' + encodeURIComponent(to) +
      '&sort=desc&limit=' + (group.length * 4);

    let data = null;
    try { data = await fr24Fetch(path, env); } catch (e) { data = null; }
    if (Array.isArray(data)) {
      data.forEach((rec) => {
        const key = normalizeCode(rec.flight || '');
        if (key && !byCode.has(key)) byCode.set(key, rec); // sort=desc -> ilk gelen en güncel kayıt
      });
    }
  }
  return byCode;
}

/* codes: [{code, expectedMin}] — AYT tek seferde çekilip hepsiyle eşleştirilir;
   AYT'de olmayanlar için FR24'e (yine tek/az sayıda toplu istekle) gidilir.

   ÖNEMLİ: iki ayrı önbellek katmanı var, birbirine KARIŞTIRILMAMALI:
   1) Genel SONUÇ önbelleği (cacheKeys) — HER ZAMAN kısa TTL. Bunun amacı
      sadece art arda gelen client anketlerinde AYT+FR24'ü tekrar tekrar
      çalıştırmamak; bir uçuşun kaynağını (ayt/fr24) SAATLERCE kilitlememeli,
      yoksa AYT sonradan o uçuşu gösterse bile (ör. "Bagaj Bantta" durumuna
      geçtiğinde) biz hâlâ eski FR24 cevabını ("İndi") döndürmeye devam ederiz.
   2) FR24 "inmiş" onayı için AYRI ve uzun TTL'li bir önbellek — SADECE FR24'ün
      pahalı flight-summary çağrısını tekrarlamamak için kullanılır. AYT
      kontrolünü asla engellemez; AYT her döngüde yeniden denenir ve varsa
      her zaman önceliklidir. */
async function resolveCodes(entries, cache, origin, env) {
  const result = {};
  const uncached = [];
  const cacheKeys = {};

  for (const entry of entries) {
    const key = new Request(origin + '/cache/v2/' + normalizeCode(entry.code));
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

    /* AYT'de olmayanlar için: daha önce FR24'ten "inmiş" onayı alıp ayrı
       önbellekte sakladıysak tekrar sormayız; almadıysak taze sorgularız. */
    const needFr24 = [];
    const fr24LandedCache = new Map();
    for (const entry of uncached) {
      const norm = normalizeCode(entry.code);
      if (aytByCode.has(norm)) continue;
      const landedKey = new Request(origin + '/fr24landed/v2/' + norm);
      const hit = await cache.match(landedKey);
      if (hit) fr24LandedCache.set(norm, await hit.json());
      else needFr24.push(entry);
    }

    let fr24ByCode = new Map();
    try { fr24ByCode = await fetchFr24Summary(needFr24, env); } catch (e) { fr24ByCode = new Map(); }

    /* Her kod TAMAMEN bağımsız try/catch içinde — biri patlarsa diğerlerini
       (Promise.all reject edip TÜM toplu isteği etkileyerek) bozmasın. */
    await Promise.all(uncached.map(async (entry) => {
      const code = entry.code;
      const norm = normalizeCode(code);
      let value = { ucusDurum: null };
      let rawFr24Rec = null;

      try {
        const aytRow = aytByCode.get(norm);
        if (aytRow) {
          value = buildResultFromAyt(aytRow);
        } else {
          rawFr24Rec = fr24ByCode.get(norm) || fr24LandedCache.get(norm) || null;
          if (rawFr24Rec) value = buildResultFromFr24(rawFr24Rec, entry.expectedMin);
        }
      } catch (e) { /* değer null kalır, diğer kodları etkilemez */ }

      result[code] = value;

      /* Genel sonuç HER ZAMAN kısa TTL ile önbelleklenir — AYT bir dahaki
         döngüde mutlaka yeniden kontrol edilsin diye. */
      try {
        const resp = new Response(JSON.stringify(value), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=' + (value.kaynak === 'ayt' ? CACHE_TTL : FR24_ACTIVE_TTL) },
        });
        await cache.put(cacheKeys[code], resp);
      } catch (e) { /* cache yazılamazsa da sonuç yine döner, sadece önbelleklenmez */ }

      /* FR24'ün İNMİŞ onayı ayrı ve uzun TTL'li önbellekte saklanır — sadece
         FR24 çağrısını tekrarlamamak için; AYT kontrolünü etkilemez. */
      if (value.kaynak === 'fr24' && value.gercekVaris && rawFr24Rec) {
        try {
          const landedKey = new Request(origin + '/fr24landed/v2/' + norm);
          const resp2 = new Response(JSON.stringify(rawFr24Rec), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=' + FR24_LANDED_TTL },
          });
          await cache.put(landedKey, resp2);
        } catch (e) { /* önbelleklenemezse bir dahaki döngüde FR24'e tekrar sorar, sorun değil */ }
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

async function handleRequest(request, env) {
  if (request.method === 'OPTIONS') return withCors({}, 204);

  const url = new URL(request.url);
  const cache = caches.default;

  const codesParam = url.searchParams.get('codes');
  const codeParam = url.searchParams.get('code');

  if (codesParam) {
    const entries = parseEntries(codesParam);
    if (!entries.length) return withCors({ error: 'codes parametresi boş' }, 400);
    let result;
    try { result = await resolveCodes(entries, cache, url.origin, env); }
    catch (e) { result = {}; entries.forEach((en) => { result[en.code] = { ucusDurum: null }; }); }
    return withCors(result);
  }

  if (codeParam) {
    const result = await resolveCodes([{ code: codeParam, expectedMin: null }], cache, url.origin, env);
    return withCors(result[codeParam] || { ucusDurum: null });
  }

  return withCors({ error: 'code veya codes parametresi zorunlu' }, 400);
}

/* ES Module formatı — FR24_API_TOKEN gibi secret/env değişkenlerine erişmek
   için bu format (export default) gerekli; klasik addEventListener('fetch')
   formatında env parametresi gelmiyor. */
export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  },
};
