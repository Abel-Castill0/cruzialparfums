# Galería de fotos de proceso

La galería comparte las cinco fotos de perfumes sellados que hoy son las únicas publicables en `/parfums` y `/import`. Los archivos públicos están en `apps/web/public/process-gallery/` como WebP de hasta 1200 px de ancho y calidad 80.

## Fotos publicadas

- `perfumes-sellados-1.webp`
- `perfumes-sellados-2.webp`
- `perfumes-sellados-3.webp`
- `perfumes-sellados-4.webp`
- `perfumes-sellados-5.webp`

## Próximas fotos

Quedan 17 fotos pendientes de blur y aprobación antes de publicarlas. Cuando el cliente entregue las versiones revisadas, confirmar que rostros, datos de contacto, placas, etiquetas de envío y otros identificadores estén ocultos. Luego se distribuirán por página: Import recibirá perfumes sellados y entregas de Shalom; Parfums recibirá clientes, motorizados y pedidos. Las capturas de chats y las fotos con datos de pedidos identificables se mantienen excluidas; no se incorporan por defecto.

## Diseño del collage

Las fotos forman un collage estático de tarjetas tipo polaroid: rotación máxima de ±3° en escritorio y ±1.5° en móvil, marco blanco sencillo con esquinas casi rectas y sombra tenue. No se usan textos manuscritos, cursivas, cinta, clips ni chinchetas. El hover eleva solo la tarjeta enfocada en escritorio; en móvil se apilan con un solapamiento leve y el toque abre el lightbox. `prefers-reduced-motion` elimina rotaciones, transformaciones y transiciones.

## Política de privacidad aplicada

Solo se publican fotos de producto sin personas ni datos personales expuestos. Las fotos con rostros, conversaciones, placas, etiquetas de envío o contexto que permita identificar a una persona permanecen fuera de `public/` hasta su revisión y autorización. Las fotos publicadas en esta galería no se recortan; el encuadre 4:5 se limita a la tarjeta y el lightbox muestra la imagen completa.
