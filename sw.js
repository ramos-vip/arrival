/* ════ RAMOS NJT Karşılama Paneli — Service Worker ════
   Amaç: internet tamamen kesilse bile uygulama kabuğu (HTML/JS/CSS) açılsın.
   Rezervasyon verisi zaten localStorage'da ayrıca önbelleğe alınıyor (app.js,
   ramos_cache) — bu sadece SAYFANIN AÇILABİLMESİNİ garanti ediyor. */

var CACHE_NAME = 'ramos-karsilama-v1';
var APP_SHELL = ['./', './index.html', './app.js', './style.css'];

self.addEventListener('install', function(event){
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){ return cache.addAll(APP_SHELL); })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event){
  var req = event.request;
  if(req.method !== 'GET') return; /* POST'lara (durum güncelleme, giriş vb.) dokunma */

  var url = new URL(req.url);
  var isAppShell = url.origin === self.location.origin;
  if(!isAppShell) return; /* API/uçuş isteklerine karışma, onlar kendi mantığıyla çalışsın */

  event.respondWith(
    caches.match(req).then(function(cached){
      var network = fetch(req).then(function(res){
        if(res && res.ok){
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(req, copy); });
        }
        return res;
      }).catch(function(){ return cached; });
      /* Ağ hızlıysa onu kullan, yoksa cache'e düş — "stale while revalidate" */
      return cached || network;
    })
  );
});
