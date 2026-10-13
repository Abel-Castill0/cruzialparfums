# Limpieza de la consola (2026-10-12)

## Estado medido (build de producción, `/parfums` y `/import`, Chromium)

| Momento | Avisos y errores de consola |
|---|---|
| Al cargar la página (TikTok sin abrir) | **0** en `/parfums` y `/import` (y 0 en `/`, `/parfums/catalogo`, `/parfums/combos` según la prueba `browser console hygiene` de #103) |
| Tras pulsar «Reproducir video» | 14–16, **todos dentro del iframe de TikTok** (origen `www.tiktok.com`) |

El embed sólo se carga **después del clic** (portada con botón), así que la página no emite nada de TikTok mientras nadie lo abre.

## Errores reportados y su causa

| Mensaje | Causa | ¿Es nuestro? |
|---|---|---|
| `ERR_BLOCKED_BY_CLIENT` en `mon.tiktokv.com`, `sgali-mcs.byteoversea.com` | telemetría del player de TikTok bloqueada por un bloqueador o la protección de rastreo del navegador | No: lo hace el JS de TikTok dentro del iframe |
| `Access to XMLHttpRequest at 'https://mon.tiktokv.com/…' … blocked by CORS` + `403` | el mismo POST de telemetría, rechazado por el servidor de TikTok | No |
| `403` en `v16-webapp-prime.tiktok.com` | CDN de TikTok rechazando la petición (referer, zona o automatización) | No |
| `You will need to pass in an @ies/starling_intl instance…` | advertencia de la librería i18n de TikTok | No |
| `getRelatedApps failed … only supported in top-level browsing contexts` | TikTok llama a una API que sólo existe fuera de iframes | No |
| `Permissions policy violation: accelerometer is not allowed` | el iframe pedía acelerómetro y nuestro `allow` no lo daba | **Sí → corregido en #104** (`accelerometer; gyroscope; autoplay; clipboard-write`) |
| `Unrecognized feature: 'web-share'` | `web-share` no es una característica válida de `allow` en Chromium; la añadí en #104 | **Sí → quitada en esta rama** |
| `Allow attribute will take precedence over 'allowfullscreen'` | atributo `allowfullscreen` redundante | **Sí → quitado en #104** |
| `preloaded using link preload but not used` | CSS del `not-found` precargado en cada ruta | **Sí → corregido en #103** |
| `Error with Permissions-Policy header: Unrecognized feature: 'interest-cohort'` | cabecera obsoleta | **Sí → quitada en #103** |

## CSP: ¿hay que añadir dominios de TikTok?

**No.** Nuestra Content-Security-Policy gobierna lo que carga **nuestra** página (`frame-src` ya permite sólo `https://www.tiktok.com`);
lo que el iframe pide a `mon.tiktokv.com` o `byteoversea.com` se rige por la política de `www.tiktok.com`, no por la nuestra, y
añadirlos a la nuestra no cambiaría nada (y ensancharía la superficie sin motivo). No se tocó.

## Decisión

Estos errores **son esperados mientras se use el embed y no afectan a la funcionalidad del sitio**; el remedio real es no usar el
embed: el reproductor propio (`docs/tiktok-solution.md`) no carga ningún recurso de terceros. En cuanto el dueño aporte los MP4 y se
rellene `hosted`, la consola queda en 0 también tras reproducir (comprobado con un video de prueba: sólo peticiones a `localhost`).

## Otros avisos revisados

- `Permissions-Policy`: sin `interest-cohort`; el resto de características sigue reconocido.
- Avisos de `preload` de imágenes: el héroe precarga sólo la imagen LCP de su pantalla (`media` complementarios); la prueba
  `browser console hygiene` lo vigila en el build de producción.
- `Download the React DevTools` y `[HMR] connected` son del servidor de desarrollo, no de producción.
