/* ============================================================
   CRUZIAL PARFUMS — Service Worker v2
   Stale-while-revalidate for HTML, cache-first for assets
   ============================================================ */

const CACHE_VERSION = "v2";
const CACHE_NAME = "cruzial-" + CACHE_VERSION;
const PRECACHE = "cruzial-precache-" + CACHE_VERSION;

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

/* Install: precache static assets */
self.addEventListener("install", function(e) {
  e.waitUntil(
    caches.open(PRECACHE).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

/* Activate: clean ALL old caches */
self.addEventListener("activate", function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) {
          return n.startsWith("cruzial-") && n !== PRECACHE && n !== CACHE_NAME;
        }).map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

/* Fetch strategies */
self.addEventListener("fetch", function(e) {
  var url = new URL(e.request.url);

  /* Skip non-GET, cross-origin, analytics, API */
  if (e.request.method !== "GET") return;
  if (url.origin !== location.origin) return;
  if (url.pathname.includes("/api/") || url.hostname.includes("google-analytics")) return;

  /* HTML: stale-while-revalidate (show cache, update in background) */
  if (e.request.mode === "navigate" || e.request.headers.get("accept")?.includes("text/html")) {
    e.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(e.request).then(function(cached) {
          var fetchPromise = fetch(e.request).then(function(networkResponse) {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(e.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(function() {
            return cached;
          });
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  /* CSS/JS/Images: cache-first */
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
    })
  );
});

/* Notify clients when new SW is available */
self.addEventListener("message", function(e) {
  if (e.data && e.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
