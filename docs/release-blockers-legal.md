# Datos legales y de lanzamiento — CRUZIAL V2

Actualizado 2026-10-04. Este documento NO contiene datos legales inventados.

**Principio:** un dato que solo el negocio conoce (RUC, razón social, dirección,
políticas) **no bloquea la ingeniería**. Se construye todo lo demás, el sitio
muestra un estado seguro mientras el dato falta, y el cliente lo completa o
actualiza desde el panel cuando quiera. Lo único que sigue cerrado hasta
entonces es la indexación pública (`CRUZIAL_PRODUCTION_CUTOVER_APPROVED`),
porque publicar una identidad legal falsa o vacía sería un riesgo para el
negocio.

## Ya implementado (evidencia en el repositorio)

- **Libro de Reclamaciones virtual**: ruta pública `/libro-de-reclamaciones`
  (`apps/web/src/app/libro-de-reclamaciones/`: formulario, acción de servidor y
  pruebas) y administración de reclamos en `/admin/parfums/reclamos`.
  Funciona aunque la identidad legal aún no esté completa: el reclamo se
  registra igual y la página lo avisa. *(Una versión anterior de este
  documento decía lo contrario; era incorrecto.)*
- **Edición de la identidad legal desde el panel**: razón social, RUC,
  dirección legal y contacto de reclamos se editan en
  `/admin/parfums/configuracion` y `/admin/import/configuracion`
  (`apps/web/src/components/admin/business-legal-editor.tsx`). Se muestran en
  las páginas legales y en el Libro de Reclamaciones apenas se guardan.

## Lo completa el cliente en el panel (no bloquea ingeniería)

- Razón social, RUC y dirección legal / de reclamos de cada unidad.
- Contacto responsable de atender reclamos.
- Confirmación de la política de devoluciones y cambios. Hoy el sitio publica
  una redacción conservadora (sin devoluciones salvo producto defectuoso o
  envío incorrecto, caso por caso); es válida hasta que el cliente la cambie.
- Métodos de pago a publicar. Hoy el sitio no lista ninguno: el pago se
  coordina por WhatsApp fuera de la web.

## Lo verifica el operador o el negocio (no es trabajo de código)

- Si Cruzial debe inscribirse en el Registro Nacional de Protección de Datos
  Personales como responsable del tratamiento (nombres, teléfonos y
  direcciones de entrega).
- Revisión legal peruana de los textos de privacidad y términos. Las
  modificaciones de textos legales se tratan como propuestas, no como cambios
  directos.

## Regla operativa

- No colocar RUC, dirección ni razón social de relleno en producción. Mientras
  falten, las páginas legales mantienen su redacción conservadora y no
  afirman una identidad legal específica.
- `CRUZIAL_PRODUCTION_CUTOVER_APPROVED` se activa por decisión explícita del
  negocio cuando considere completos sus datos. Es una decisión de lanzamiento,
  no una tarea pendiente de desarrollo.
- Lo que el cliente decida o corrija se registra en `docs/client-decisions.md`
  (junto con su huella de conciliación) o, para cambios que no deban tocar ese
  archivo, en una nota dedicada como `docs/parfums-shipping.md`.
