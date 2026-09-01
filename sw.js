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

const CACHE_VERSION = "v7"; // strict scope-relative precache: missing app-shell assets must fail install.
const CACHE_NAME = "cruzial-" + CACHE_VERSION;
const PRECACHE = "cruzial-precache-" + CACHE_VERSION;

/* Rutas relativas al SCOPE del propio SW, no absolutas al dominio.
   self.registration.scope ya resuelve distinto según dónde se registró
   sw.js (ver index.html: navigator.serviceWorker.register("sw.js"), ruta
   relativa) -- "/" en un preview local servido desde la raíz del repo,
   "/cruzialparfums/" en GitHub Pages. Antes las 13 rutas estaban escritas
   como "/cruzialparfums/..." a mano: instalaban bien en producción pero
   cache.addAll() fallaba por completo en local (todas piden 404 bajo un
   subpath que no existe ahí), y addAll() rechaza el install entero si
   UNA sola request no responde 200 -- el error real en consola. */
const toScopeURL = path => new URL(path, self.registration.scope).href;
const STATIC_ASSETS = [
  "",
  "index.html",
  "catalog.html",
  "product.html",
  "checkout.html",
  "combos.html",
  "mayorista.html",
  "nosotros.html",
  "contacto.html",
  "terminos.html",
  "privacidad.html",
  "img/logo-mark.png",
  "manifest.json"
].map(toScopeURL);

/* Install: todo el listado es app-shell crítico. El install debe fallar si
   una URL no existe o devuelve un status no exitoso; ocultar ese error deja
   una PWA parcialmente cacheada y convierte un bug de deploy en un fallo
   offline difícil de diagnosticar. */
self.addEventListener("install", function(e) {
  e.waitUntil(
    caches.open(PRECACHE).then(function(cache) {
      return Promise.all(STATIC_ASSETS.map(function(url) {
        return fetch(url).then(function(res) {
          if (!res || !res.ok) throw new Error("Precache failed (" + (res && res.status) + "): " + url);
          return cache.put(url, res);
        });
      }));
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
