/* ============================================================
   Karşılama paneli — canlı uçuş durumu (DHMI Uçuş İzle)
   Cloudflare Worker — ramosnjttransfer.com'daki VPS'e HİÇ dokunmaz,
   tamamen bağımsız, ücretsiz çalışır.

   Kullanım (tek uçuş):  GET /?code=TK1234
   Kullanım (toplu):     GET /?codes=TK1234,XQ199,DK776
   Saat ipucuyla (bazı havayolları — örn. SunExpress/XQ — DHMI'de gerçek uçuş
   numarasıyla değil farklı bir çağrı koduyla göründüğü için, rezervasyondaki
   beklenen saati de gönderirsek kod eşleşmezse saat bazlı eşleştirme deneriz):
                         GET /?codes=XQ571@14:25,TK1234@10:00
   Toplu yanıt: { "XQ571": {...}, "TK1234": {...} }

   Deploy:
     1) https://dash.cloudflare.com → Workers & Pages → Create → Create Worker
     2) İsim ver, Deploy'a bas
     3) "Edit code" → buradaki tüm içeriği yapıştır → Deploy
     4) Çıkan URL'yi app.js'teki FLIGHT_STATUS_API değişkenine yaz
   ============================================================ */

const DHMI_BASE = 'https://ucusizle.dhmi.gov.tr';
const AYT_URL = 'https://www.antalya-airport.aero/yolcu-ve-ziyaretciler/ucus-bilgileri/tum-hatlar-gelis';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const CACHE_TTL = 90; // saniye — kaynaklara gereğinden fazla istek gitmesin
const LOCATION_TRAIL_POINTS = 12; // haritada rota izi için son kaç konum noktası
const TIME_MATCH_TOLERANCE_MIN = 15; // saat bazlı eşleştirmede kabul edilen fark
const MAX_FALLBACK_CANDIDATES = 15; // bir havayolu için saat eşleştirmesinde en fazla kaç uçuşa detay sorulsun
const MAX_BATCH_ENTRIES = 40; // Cloudflare Worker'ın alt-istek sınırını (50) aşmamak için tek istekte üst sınır
const AYT_LANDED_STATUSES = ['İndi', 'Son Bagaj', 'Bagaj Bantta', 'Belt Kapandı'];

function normalizeCode(code) {
  const m = /^([A-Za-z]+)0*(\d+)$/.exec((code || '').trim());
  return m ? (m[1].toUpperCase() + parseInt(m[2], 10)) : (code || '').toUpperCase();
}

function airlinePrefix(code) {
  const m = /^([A-Za-z]+)/.exec((code || '').trim());
  return m ? m[1].toUpperCase() : '';
}

function parseDhmiDate(s) {
  if (!s) return null;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]);
}

/* "14:25" -> gece yarısından itibaren dakika (sadece saat karşılaştırması için) */
function timeStrToMinutes(s) {
  const m = /^(\d{1,2}):(\d{2})/.exec((s || '').trim());
  if (!m) return null;
  return (+m[1]) * 60 + (+m[2]);
}

async function dhmiFetch(path) {
  const res = await fetch(DHMI_BASE + path, {
    headers: { 'User-Agent': BROWSER_UA, 'Accept': 'application/json' },
  });
  if (!res.ok) return null;
  const outer = await res.json();
  if (!outer || typeof outer.data !== 'string') return null;
  try { return JSON.parse(outer.data); } catch (e) { return null; }
}

function buildResultFromDetail(detail) {
  const scheduled = parseDhmiDate(detail.scheduledArrTime);
  /* Öncelik gerçek iniş saatinde — DHMI uçak indikten sonra "tahmini" alanını
     güncellemeyebiliyor (eski/planlanan değerde donuk kalabiliyor). */
  const estimated = parseDhmiDate(detail.actualArrTime) || parseDhmiDate(detail.estimatedArrTime);

  const locations = Array.isArray(detail.location) ? detail.location : [];
  const lastLoc = locations.length ? locations[locations.length - 1] : null;
  const trail = locations
    .slice(-LOCATION_TRAIL_POINTS)
    .filter((p) => typeof p.lat === 'number' && typeof p.lon === 'number')
    .map((p) => [p.lat, p.lon]);

  const foto = (detail.planeImgUrl || '').indexOf('TEMPLATE') > -1 ? '' : (detail.planeImgUrl || '');
  const logo = (detail.airlineImgUrl || '').indexOf('null.png') > -1 ? '' : (detail.airlineImgUrl || '');

  const base = {
    havayolu: detail.airlineName || '',
    ucakTipi: detail.uType || '',
    kalkisSehir: detail.sourceCity || '',
    varisSehir: detail.destinationCity || '',
    kalkisIata: detail.sourceIata || '',
    varisIata: detail.destinationIata || '',
    kapi: detail.gateNumber || '',
    terminal: detail.terminalArr || '',
    bagajBandi: detail.baggageNumber || '',
    planlananVaris: detail.scheduledArrTime || '',
    tahminiVaris: detail.estimatedArrTime || '',
    gercekVaris: detail.actualArrTime || '',
    ucakFoto: foto,
    havayoluLogo: logo,
    lat: lastLoc ? lastLoc.lat : null,
    lon: lastLoc ? lastLoc.lon : null,
    irtifa: lastLoc ? lastLoc.altitude : null,
    rota: trail,
    eslesmeYontemi: null, // 'kod' veya 'saat' — resolveOne doldurur
  };

  if (!scheduled || !estimated) return Object.assign({ ucusDurum: null }, base);

  const delayMin = Math.round((estimated.getTime() - scheduled.getTime()) / 60000);

  if (delayMin > 5) {
    return Object.assign({
      ucusDurum: 'gecikti',
      ucusDurumMetin: delayMin + ' dk gecikti',
      ucusGecikmeDk: delayMin,
    }, base);
  }
  return Object.assign({ ucusDurum: 'zamaninda', ucusDurumMetin: 'Zamanında', ucusGecikmeDk: 0 }, base);
}

/* ════ ANTALYA HAVALİMANI (antalya-airport.aero) — birincil kaynak ════
   DHMI'nin "tahmini" alanından çok daha güvenilir: yer hizmetlerinin girdiği
   gerçek "İndi / Son Bagaj / Bagaj Bantta" durumları var. Düz HTML, oturum/
   ViewState gerekmiyor — tek GET isteğiyle günün tüm gelişleri geliyor. */
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

/* Aynı havayolunun Antalya'ya (LTAI) inen uçuşları arasından, planlanan saati
   beklenen saate en yakın olanı bulur — kod eşleşmezse (örn. SunExpress/XQ'nun
   DHMI'de farklı çağrı koduyla görünmesi gibi) son çare olarak kullanılır. */
async function findByTimeFallback(all, prefix, expectedMin, detailCache) {
  if (expectedMin == null) return null;

  const candidates = all.filter((f) =>
    airlinePrefix(f.flightCode) === prefix &&
    f.flightId && f.flightId.split('-').pop() === 'LTAI'
  ).slice(0, MAX_FALLBACK_CANDIDATES); // Cloudflare alt-istek sınırını korumak için üst sınır
  if (!candidates.length) return null;

  const details = await Promise.all(candidates.map(async (f) => {
    if (detailCache.has(f.flightId)) return { f, d: detailCache.get(f.flightId) };
    let d = null;
    try { d = await dhmiFetch('/api/flight/' + encodeURIComponent(f.flightId)); } catch (e) { d = null; }
    detailCache.set(f.flightId, d);
    return { f, d };
  }));

  let best = null;
  let bestDiff = Infinity;
  for (const { f, d } of details) {
    if (!d || !d.scheduledArrTime) continue;
    const mins = timeStrToMinutes(d.scheduledArrTime.split(' ')[1]);
    if (mins == null) continue;
    const diff = Math.abs(mins - expectedMin);
    if (diff < bestDiff) { bestDiff = diff; best = d; }
  }
  return (best && bestDiff <= TIME_MATCH_TOLERANCE_MIN) ? best : null;
}

/* codes: [{code, expectedMin}] — birden fazla uçuş kodunu TEK "/api/flight/all"
   çağrısı üzerinden çözer (N+1 sorununu önler) — sadece cache'te olmayanlar
   için DHMI'ye gidilir. */
async function resolveCodes(entries, cache, origin) {
  const result = {};
  const uncached = [];
  const cacheKeys = {};

  for (const entry of entries) {
    const key = new Request(origin + '/cache/' + normalizeCode(entry.code));
    cacheKeys[entry.code] = key;
    const hit = await cache.match(key);
    if (hit) {
      result[entry.code] = await hit.json();
    } else {
      uncached.push(entry);
    }
  }

  if (uncached.length) {
    let all = null;
    let aytRows = [];
    /* AYT (havalimanı) + DHMI paralel çekilir — biri patlarsa diğeri yine çalışsın diye ayrı try/catch */
    const [dhmiResult, aytResult] = await Promise.all([
      dhmiFetch('/api/flight/all').catch(() => null),
      fetchAytArrivals().catch(() => []),
    ]);
    all = dhmiResult;
    aytRows = aytResult;
    const aytByCode = new Map();
    aytRows.forEach((r) => { if (!aytByCode.has(r.code)) aytByCode.set(r.code, r); });

    if (Array.isArray(all) || aytByCode.size) {
      const detailCache = new Map(); // ayni istekte birden fazla kod ayni havayoluna bakarsa tekrar cekmesin
      /* Her kod TAMAMEN bağımsız try/catch içinde — biri patlarsa diğerlerini
         (Promise.all reject edip TÜM toplu isteği null'a düşürerek) etkilemesin. */
      await Promise.all(uncached.map(async (entry) => {
        const code = entry.code;
        let value = { ucusDurum: null };

        try {
          /* 1) Önce Antalya Havalimanı'nın kendi verisi — DHMI'nin tahmininden
             çok daha doğru (yer hizmetlerinin girdiği gerçek İndi/Son Bagaj durumu) */
          const aytRow = aytByCode.get(normalizeCode(code));
          if (aytRow) {
            value = buildResultFromAyt(aytRow);
          } else if (Array.isArray(all)) {
            const target = normalizeCode(code);
            const direct = all.find((f) => normalizeCode(f.flightCode) === target);

            if (direct) {
              const detail = detailCache.has(direct.flightId)
                ? detailCache.get(direct.flightId)
                : await dhmiFetch('/api/flight/' + encodeURIComponent(direct.flightId));
              detailCache.set(direct.flightId, detail);
              if (detail) { value = buildResultFromDetail(detail); value.eslesmeYontemi = 'kod'; value.kaynak = 'dhmi'; }
            } else {
              const fallbackDetail = await findByTimeFallback(all, airlinePrefix(code), entry.expectedMin, detailCache);
              if (fallbackDetail) { value = buildResultFromDetail(fallbackDetail); value.eslesmeYontemi = 'saat'; value.kaynak = 'dhmi'; }
            }
          }
        } catch (e) { /* değer null kalır, diğer kodları etkilemez */ }

        result[code] = value;
        try {
          const resp = new Response(JSON.stringify(value), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=' + CACHE_TTL },
          });
          await cache.put(cacheKeys[code], resp);
        } catch (e) { /* cache yazılamazsa da sonuç yine döner, sadece önbelleklenmez */ }
      }));
    } else {
      uncached.forEach((entry) => { result[entry.code] = { ucusDurum: null }; });
    }
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

/* ES Module ("export default") yerine klasik "Service Worker" formatı —
   bazı Cloudflare projelerinde export sözdizimi desteklenmiyor, bu format
   her ikisinde de çalışır. */
async function handleRequest(request) {
  if (request.method === 'OPTIONS') return withCors({}, 204);

  const url = new URL(request.url);
  const cache = caches.default;

  const codesParam = url.searchParams.get('codes');
  const codeParam = url.searchParams.get('code');

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

addEventListener('fetch', function(event) {
  event.respondWith(handleRequest(event.request));
});
