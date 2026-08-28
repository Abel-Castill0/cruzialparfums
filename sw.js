/* ============================================================
   CRUZIAL PARFUMS — Service Worker
   Caches static assets for faster repeat visits
   ============================================================ */

const CACHE_NAME = "cruzial-v1";
const STATIC_ASSETS = [
  "/cruzialparfums/",
  "/cruzialparfums/index.html",
  "/cruzialparfums/catalog.html",
  "/cruzialparfums/product.html",
  "/cruzialparfums/mayorista.html",
  "/cruzialparfums/nosotros.html",
  "/cruzialparfums/contacto.html",
  "/cruzialparfums/assets/styles.css",
  "/cruzialparfums/assets/data.js",
  "/cruzialparfums/assets/app.js",
  "/cruzialparfums/logo.jpeg",
  "/cruzialparfums/manifest.json"
];

/* Install: cache static assets */
self.addEventListener("install", function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

/* Activate: clean old caches */
self.addEventListener("activate", function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
             .map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

/* Fetch: cache-first for static, network-first for others */
self.addEventListener("fetch", function(e) {
  var url = new URL(e.request.url);

  /* Skip non-GET and cross-origin */
  if (e.request.method !== "GET") return;
  if (url.origin !== location.origin) return;

  /* Skip API calls and analytics */
  if (url.pathname.includes("/api/") || url.hostname.includes("google-analytics")) return;

  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(response) {
        if (!response || response.status !== 200) return response;
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(e.request, clone);
        });
        return response;
      });
    }).catch(function() {
      /* Offline fallback: return cached index for navigation */
      if (e.request.mode === "navigate") {
        return caches.match("/cruzialparfums/index.html");
      }
    })
  );
});
