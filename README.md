# Cruzial Parfums — Tienda de decants (menor y mayor)

Sitio estático multi-página, elegante y de lujo para una tienda de decants de perfumes originales. Sin pasarela de pagos: el cliente arma su carrito, completa sus datos en el checkout y el pedido se envía con un mensaje predeterminado a WhatsApp.

## Estructura

| Archivo | Descripción |
| --- | --- |
| `index.html` | Home editorial: hero, colecciones, bestsellers, arte del decant, cómo comprar, mayorista, testimonios, journal, FAQ, newsletter |
| `catalog.html` | Catálogo con filtros (género, familia, tipo) y ordenamiento |
| `product.html?id=...` | Detalle de fragancia: notas, concentración, formatos 1/2/5/10 ml, relacionados |
| `checkout.html` | Carrito + datos del pedido → envío por WhatsApp |
| `nosotros.html` | Historia y valores de la casa |
| `mayorista.html` | Venta al por mayor: tarifas de referencia y formulario de cotización |
| `contacto.html` | Contacto y asesoría olfativa por WhatsApp |
| `assets/data.js` | Configuración + catálogo de 22 productos |
| `assets/styles.css` | Sistema de diseño Noir & Champagne Gold |
| `assets/app.js` | Carrito, buscador, drawer, botellas SVG, WhatsApp |

## Personalización obligatoria antes de producción

1. **Número de WhatsApp**: cambiar `WA_NUMBER` en `assets/data.js` (código de país + número, sin `+` ni espacios). También aparece en los enlaces `wa.me` de cada HTML.
2. **Productos**: precios, notas, descripciones y paletas (`mood`) en `assets/data.js`. El color de cada botella SVG se controla con `mood.a`, `mood.b`, `mood.liquid` y `mood.glow`.
3. **Redes sociales**: enlaces de Instagram/TikTok en el footer y `contacto.html`.
4. **Políticas reales**: envíos, tiempos y cambios en FAQ y checkout.
5. **Dominio y analítica**: añadir cuando se despliegue.

## Flujo de compra

1. Explorar colección o buscar por marca/nota.
2. Añadir al carrito (formatos 1, 2, 5 y 10 ml).
3. Carrito persistente en `localStorage` (drawer lateral en todas las páginas).
4. Checkout con datos de contacto → botón "Enviar pedido por WhatsApp" que abre `wa.me` con el pedido detallado y el total estimado.
5. Confirmación de stock, envío y total final por WhatsApp.

## Despliegue

Sitio 100% estático: basta subir la carpeta a cualquier hosting (Netlify, Vercel, GitHub Pages, cPanel). No requiere build ni dependencias.