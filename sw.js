/* ============================================================
   CRUZIAL PARFUMS — Service Worker v4
   Network-first for HTML (precios y catálogo nunca deben quedar
   pegados a una versión vieja del caché — ver ZERO INVENTED COMMERCE
   en CLAUDE.md: mostrar un precio desactualizado por un caché
   agresivo es tan grave como inventarlo). Cache-first para CSS/JS/
   imágenes: su identidad ahora es la URL completa con ?v=... (ver
   .claude/scripts/cache_bust.js), así que cache-first + esa versión
   en la URL ES la invalidación -- no precachear estos archivos por su
   ruta desnuda (sin ?v=) aquí abajo, sería una segunda estrategia de
   invalidación en paralelo y nadie volvería a pedir esa URL exacta
   (quedaría como peso muerto en el caché). Se cachean solos, cache-
   first, la primera vez que una página real los pide con su ?v= actual.
   ============================================================ */

const CACHE_VERSION = "v4";
const CACHE_NAME = "cruzial-" + CACHE_VERSION;
const PRECACHE = "cruzial-precache-" + CACHE_VERSION;

const STATIC_ASSETS = [
  "/cruzialparfums/",
  "/cruzialparfums/index.html",
  "/cruzialparfums/catalog.html",
  "/cruzialparfums/product.html",
  "/cruzialparfums/checkout.html",
  "/cruzialparfums/combos.html",
  "/cruzialparfums/mayorista.html",
  "/cruzialparfums/nosotros.html",
  "/cruzialparfums/contacto.html",
  "/cruzialparfums/terminos.html",
  "/cruzialparfums/privacidad.html",
  "/cruzialparfums/img/logo-mark.png",
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

  /* HTML: network-first — intenta la red primero (catálogo y precios
     siempre al día); si no hay red, cae al caché para que el sitio
     siga siendo usable offline. */
  if (e.request.mode === "navigate" || e.request.headers.get("accept")?.includes("text/html")) {
    e.respondWith(
      fetch(e.request).then(function(networkResponse) {
        if (networkResponse && networkResponse.status === 200) {
          var clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
        }
        return networkResponse;
      }).catch(function() {
        return caches.open(CACHE_NAME).then(function(cache) { return cache.match(e.request); });
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
