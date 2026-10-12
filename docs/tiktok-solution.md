# Video de la home: salir del embed de TikTok

## Problema

Al pulsar play dentro del reproductor de TikTok (iframe `player/v1`) aparece **«Player error — An error occurred with the video
player. Please check your network connection.»**. En la consola, dentro del iframe: `ERR_BLOCKED_BY_CLIENT` y CORS en
`mon.tiktokv.com` / `sgali-mcs.byteoversea.com`, 403 en `v16-webapp-prime.tiktok.com`. Son hosts de **telemetría y de CDN de TikTok**
que bloquean los bloqueadores de anuncios y la protección contra rastreo; el reproductor depende de ellos y, cuando fallan, no
reproduce. Nada de eso lo controla nuestro sitio: el contenido del iframe se ejecuta bajo el origen `www.tiktok.com`.

Medido (2026-10-12): el mismo «Player error» sale en Chromium de Playwright, en Edge y en el navegador de la app, con cinco variantes
de atributos del iframe (con y sin `referrerpolicy`, `allow` ampliado, URL simple) y con navegación directa o de cliente. Y
`https://www.tiktok.com/embed/v2/{id}` respondió «overload-protect triggered» en esos navegadores automatizados. Es decir: **ni los
atributos ni cambiar de embed arreglan la causa**.

## Opciones evaluadas

| | A · Archivo propio (Cloudinary / Vimeo + `<video>`) | B · Embed oficial `embed/v2` |
|---|---|---|
| Depende de TikTok en tiempo de ejecución | No | Sí (mismos hosts de telemetría) |
| Lo rompen bloqueadores y protección de rastreo | No (mismo origen / Cloudinary) | Sí |
| Errores de consola de terceros | Ninguno | Los mismos |
| CSP | `media-src` + Cloudinary, sin `frame-src` | `frame-src` TikTok |
| Estética | Control total: póster, disco dorado, 9:16 | Cromo de TikTok (usuario, likes, logo) |
| Coste | Subir 1–2 MP4 (≈ 1–3 MB cada uno, 9:16) | Ninguno |
| Verificado aquí | **Sí** (Chromium, Edge, WebKit) | No: `overload-protect` en automatización |

**Recomendación: A.** Es la única que no depende de los hosts que bloquean los navegadores. B no tiene forma de verificarse desde
este entorno y comparte la causa del fallo.

## Qué se implementó

- `HomeVideo.hosted` (`domains/platform/home-video.ts`): `{ sources: [{ src, type }], poster? }`. Sólo se acepta si **todas** las URLs
  son `https://res.cloudinary.com/...` o rutas `/...` del propio sitio (`isValidHostedVideo`, con pruebas contra `http`, subdominios
  falsos, `//host` y `javascript:`).
- `VideoStory` (`components/storefront/home/video-story.tsx`): con `hosted`, reproduce un **`<video controls playsInline>`** nativo con
  `preload="none"` y póster, un disco de play dorado encima (sólo para ratón y táctil; teclado y lectores usan los controles
  nativos) y «También lo puedes ver en TikTok» como enlace. Sin `hosted`, **todo sigue como hoy** (portada + iframe de TikTok al
  pulsar).
- CSP (`lib/security/content-security-policy.ts`): `media-src 'self' https://res.cloudinary.com` **sólo mientras** alguna home use un
  archivo alojado; `frame-src` de TikTok sólo mientras alguna home todavía use el embed. Con las dos homes en archivo propio, el sitio
  vuelve a no tener ninguna excepción de frames.
- Pruebas unitarias: validación de URLs, render con y sin archivo (sin `<iframe>` ni URL de player con archivo), CSP.

## Lo que falta (necesito los archivos)

**No se subió ningún video**: los MP4 los tiene que aportar el dueño (puede descargar los suyos desde TikTok Studio) y subirlos a su
Cloudinary; no se descargan videos de TikTok ni se escribe en la cuenta de Cloudinary de producción sin su OK. Para activarlo basta
rellenar `hosted` en `PARFUMS_HOME_VIDEO` / `IMPORT_HOME_VIDEO`:

```ts
hosted: {
  sources: [
    { src: "https://res.cloudinary.com/<cloud>/video/upload/q_auto,vc_h264,w_720/cruzial/parfums-detalle.mp4", type: "video/mp4" },
    { src: "https://res.cloudinary.com/<cloud>/video/upload/q_auto,vc_vp9,w_720/cruzial/parfums-detalle.webm", type: "video/webm" },
  ],
  poster: "https://res.cloudinary.com/<cloud>/video/upload/so_1,w_720/cruzial/parfums-detalle.jpg",
},
```

(9:16, 720 px de ancho, H.264 + WebM; el póster sale del segundo 1 del propio video.)

## Verificación de reproducción

Con un video **sintético de prueba** (patrón de barras 360×640, 4 s, MP4 H.264 + WebM VP9, generado con ffmpeg; no es arte de
marca y no se versionó), servido por el propio sitio y con el cableado temporal de `hosted`:

| Motor | Resultado |
|---|---|
| Chromium (build de Playwright) | reproduce (2.3 s tras el clic, `readyState` 4, 360×640, sin error) |
| Microsoft Edge (Chromium con H.264) | reproduce (igual) |
| WebKit (Playwright) | reproduce (2.5 s, 340×604, sin error) |
| Firefox | **no se pudo lanzar** en este entorno (`spawn UNKNOWN`, T14); sin verificar. Firefox reproduce H.264 y WebM con `<video>` estándar, pero no está probado aquí |

Peticiones durante la prueba: **sólo `localhost`**, ningún host de terceros. Capturas en `docs/screenshots/video-2026-10-12/`
(`video-propio-poster-{1280,390}.jpg`, `video-propio-reproduciendo-{chromium,edge,webkit}.jpg`).

## Limitaciones

- Hasta que lleguen los MP4, producción sigue con el embed y el mismo «Player error» en los navegadores con bloqueadores.
- Un clic en la superficie del video no inicia la reproducción en Chromium de escritorio con `preload="none"`; por eso el disco dorado
  (que llama a `play()`), probado en los tres motores.
- Un video propio consume ancho de banda de Cloudinary; con `preload="none"` no se descarga nada hasta pulsar play.
