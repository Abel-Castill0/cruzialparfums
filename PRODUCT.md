# Product

## Register

brand

## Users

Two audiences, one storefront:
- **Retail buyers** (Lima Metropolitana + Perú vía Shalom/Olva): consumidores que descubren perfumería árabe, de diseñador y de nicho a un precio accesible via decants (3/5/10 ml). Navegan en móvil, comparan por marca/nota/familia, y cierran la compra por WhatsApp — no hay pasarela de pago, el checkout es un formulario que arma el mensaje de pedido.
- **Compradores mayoristas**: negocios o revendedores que cotizan frascos completos por WhatsApp, sin precios fijos publicados.

El job-to-be-done central en ambos casos es el mismo: generar suficiente confianza y deseo visual para que el visitante presione "Enviar por WhatsApp" — el sitio no cierra la venta, la inicia.

## Product Purpose

Cruzial Parfums es una tienda de decants (perfumería árabe, diseñador y nicho) al por menor y mayor, sin pasarela de pago. El sitio existe para:
1. Presentar el catálogo (99 productos) de forma que se sienta lujoso y confiable, no como un marketplace genérico.
2. Ayudar a encontrar el perfume correcto rápido (filtros, buscador, Perfume Finder).
3. Convertir cada página en un camino corto hacia WhatsApp (producto → carrito/checkout → WhatsApp, o cotización mayorista → WhatsApp).

Éxito = el visitante llega a WhatsApp con un pedido claro (producto, tamaño, cantidad) sin fricción, en cualquier dispositivo, sin duda sobre si el sitio es serio.

## Brand Personality

**Lujo editorial, frío, aspiracional** — estética de revista de moda: distante, minimalista, sofisticada. Negro/blanco dominante con dorado como acento de precisión (no de exceso). Tipografía editorial (Cormorant Garamond serif + Jost sans + Italianno script como firma ocasional). El tono es seguro y curado, no efusivo ni "vendedor" — deja que el producto y el espacio en blanco hablen.

## Anti-references

Sin referencias específicas del cliente; por criterio de diseño, evitar activamente:
- Estética de marketplace/dropshipping (grids apretados, badges de descuento agresivos, urgencia falsa "¡Solo quedan 2!").
- Calidez tipo boutique artesanal (crema/beige, texturas "hechas a mano") — no es el tono elegido; el frío editorial es el default.
- Plantillas genéricas de e-commerce Shopify con iconografía de stock.
- Cualquier claim comercial no verificado (ver `CLAUDE.md` — ZERO INVENTED COMMERCE es una restricción de producto, no solo de copy).

## Design Principles

1. **WhatsApp es el único cierre de venta** — cada pantalla de producto/carrito/cotización debe reducir fricción hacia ese único CTA, nunca distraer con acciones competidoras (no hay newsletter, no hay gateway de pago).
2. **`assets/data.js` es la única fuente de verdad comercial** — ninguna pantalla muestra un precio, stock o claim que no pueda trazarse a ese archivo o a copy explícitamente editorial.
3. **Frío editorial, no cálido artesanal** — negro/blanco dominante, dorado como acento de precisión; el lujo se demuestra con espacio, tipografía y ritmo, no con ornamento.
4. **Sin pasos de build** — todo cambio debe funcionar sirviendo la carpeta tal cual (sin bundler); la calidad de craft no puede depender de tooling que el proyecto no tiene.
5. **Mobile-first real** — la mayoría de las conversiones a WhatsApp ocurren en móvil; cualquier pulido visual se valida primero en viewports pequeños.

## Accessibility & Inclusion

WCAG AA como estándar: contraste ≥4.5:1 en texto de cuerpo, foco visible en todo elemento interactivo, `aria-*` correcto en menú móvil/drawer/acordeones, objetivos táctiles ≥44px, `prefers-reduced-motion` respetado en toda animación (GSAP incluido).
