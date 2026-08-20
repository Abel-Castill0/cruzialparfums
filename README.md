# Cruzial Parfums — Decants y frascos (menor y mayor)

Sitio estático multi-página, elegante y de lujo para una tienda de perfumes originales: decants (1/2/5/10 ml) y frascos completos sellados, al por menor y al por mayor. Sin pasarela de pagos: el cliente arma su carrito, completa sus datos en el checkout y el pedido se envía con un mensaje predeterminado a WhatsApp.

## Estructura

| Archivo | Descripción |
| --- | --- |
| `index.html` | Home editorial: hero, colecciones, bestsellers, frascos completos, arte del decant, cómo comprar, mayorista, testimonios, journal, FAQ, newsletter |
| `catalog.html` | Catálogo con filtros (género, familia, tipo, formato) y ordenamiento; `?format=bottle` abre solo frascos |
| `product.html?id=...` | Detalle de fragancia: notas, concentración, decants 1/2/5/10 ml y frasco completo, relacionados |
| `checkout.html` | Carrito + datos del pedido → envío por WhatsApp |
| `nosotros.html` | Historia y valores de la casa |
| `mayorista.html` | Venta al por mayor: tarifas de referencia (decants y frascos) y formulario de cotización |
| `contacto.html` | Contacto y asesoría olfativa por WhatsApp |
| `logo.jpeg` | Logo oficial del cliente (medallón en header, footer y menú móvil) |
| `assets/data.js` | Configuración + catálogo de 22 productos con precios de decant (`price`) y frasco (`bottle`) |
| `assets/styles.css` | Sistema de diseño Noir & Gold (dorado tomado del logo) + responsive 320–1440 px |
| `assets/app.js` | Carrito, buscador, drawer, botellas SVG, frascos, WhatsApp |

## Personalización obligatoria antes de producción

1. **Número de WhatsApp**: cambiar `WA_NUMBER` en `assets/data.js` (código de país + número, sin `+` ni espacios). También aparece en los enlaces `wa.me` de cada HTML.
2. **Productos**: precios de decant (`price`) y de frasco completo (`bottle`, en ml) en `assets/data.js`. El color de cada botella SVG se controla con `mood.a`, `mood.b`, `mood.liquid` y `mood.glow`.
3. **Redes sociales**: enlaces de Instagram/TikTok en el footer y `contacto.html`.
4. **Políticas reales**: envíos, tiempos y cambios en FAQ y checkout.
5. **Dominio y analítica**: añadir cuando se despliegue.
6. **Logo**: `logo.jpeg` se usa en header, footer y menú móvil; reemplazarlo por el archivo final manteniendo el mismo nombre.

## Flujo de compra

1. Explorar colección o buscar por marca/nota.
2. Añadir al carrito: decant (1, 2, 5, 10 ml) o frasco completo (según fragancia, 50–100 ml). Los decants de 1–10 ml permiten probar antes de comprar el frasco.
3. Carrito persistente en `localStorage` (drawer lateral en todas las páginas); cada formato se suma por separado.
4. Checkout con datos de contacto → botón "Enviar pedido por WhatsApp" que abre `wa.me` con el pedido detallado (indica "Frasco X ml" cuando corresponde) y el total estimado.
5. Confirmación de stock, envío y total final por WhatsApp.

## Despliegue

Sitio 100% estático: basta subir la carpeta a cualquier hosting (Netlify, Vercel, GitHub Pages, cPanel). No requiere build ni dependencias.