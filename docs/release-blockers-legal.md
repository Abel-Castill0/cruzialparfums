# Bloqueadores legales para el cutover público — CRUZIAL V2

Este documento NO contiene datos legales inventados. Es la lista de insumos
que el operador/cliente debe confirmar antes de `CRUZIAL_PRODUCTION_CUTOVER_APPROVED=true`.
Ninguno de estos campos existe hoy en el repositorio ni en `docs/client-decisions.md`.

## Pendiente de confirmación del cliente

- **Razón social / nombre del proveedor legal** que opera Cruzial Parfums e
  Import (persona natural con negocio o persona jurídica).
- **RUC** (o el identificador tributario aplicable).
- **Dirección legal / de reclamos** a publicar en el Libro de Reclamaciones.
- **Contacto responsable** para atender reclamos.
- **Confirmación de la política de devoluciones/cambios** — hoy el sitio
  publica una política conservadora (sin devoluciones salvo producto
  defectuoso o envío incorrecto, evaluado caso por caso). Requiere
  aprobación explícita del cliente antes de considerarse definitiva.
- **Métodos de pago confirmados** — actualmente el sitio NO lista métodos
  específicos (transferencia, Yape, Plin, etc.); todo pago se coordina por
  WhatsApp fuera de la web. Si el cliente quiere publicar métodos
  específicos, debe confirmarlos explícitamente.

## Pendiente de verificación por el operador/negocio

- **Libro de Reclamaciones virtual** — no está implementado en esta versión.
  INDECOPI exige su disponibilidad para negocios que atienden consumidores
  en Perú. El operador debe verificar si esta obligación aplica a Cruzial y,
  de aplicar, priorizar su implementación antes del cutover público.
- **Registro en el Banco Nacional de Datos Personales** — el operador debe
  verificar si Cruzial, como responsable del tratamiento de datos
  personales (nombres, teléfonos, direcciones de entrega), está obligado a
  inscribirse ante la Autoridad Nacional de Protección de Datos Personales
  del Perú, y completar ese registro si corresponde.

## Regla operativa

- No se debe colocar ningún RUC, dirección o razón social de relleno en
  producción. Mientras estos campos no estén confirmados, las páginas
  legales (`/parfums/terminos`, `/parfums/privacidad`) deben mantenerse en
  su redacción conservadora actual (sin afirmar una identidad legal
  específica).
- `CRUZIAL_PRODUCTION_CUTOVER_APPROVED` debe permanecer `false` mientras
  cualquiera de los puntos marcados como pendiente de confirmación del
  cliente no tenga una respuesta explícita registrada (por escrito, en este
  documento o en `docs/client-decisions.md`).
