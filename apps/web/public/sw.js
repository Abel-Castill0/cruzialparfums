/* Cruzial V2 — service worker kill switch.
 *
 * The legacy static storefront registered `sw.js` at the site root with a
 * cache-first strategy for assets. Browsers that still hold that worker
 * would keep serving legacy CSS/JS/images (and their branding) after the
 * cutover. This replacement installs over it, deletes every cache, unregisters
 * itself and reloads open tabs so they fetch the V2 app directly.
 * V2 deliberately ships no PWA/offline layer: prices and availability must
 * never be served from a stale cache.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      if ("navigate" in client) client.navigate(client.url).catch(() => {});
    }
  })());
});
