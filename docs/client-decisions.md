# Cruzial Platform V2 — Client decisions

Última actualización: 2026-09-06. Una entrada `UNKNOWN` nunca es una regla de negocio.

## CONFIRMED

- Marca paraguas: CRUZIAL; unidades: CRUZIAL PARFUMS y CRUZIAL IMPORT.
- Una plataforma: `/`, `/parfums`, `/import`, `/admin`; infraestructura compartida.
- Parfums mantiene entrega inmediata, decants, sellados, combos y mayorista.
- Import es multicategoría; relojes es solo una categoría posible.
- Consolidado es campaña temporal con estados draft/scheduled/open/paused/closed/fulfilled.
- Sales modes: campaign, always_available y catalog_only (o equivalente).
- Carritos Parfums e Import deben permanecer separados.
- V1 tiene admin-only auth y no ofrece signup público.
- El email del primer administrador es `cruzialof@gmail.com`. Es un dato de
  aprovisionamiento y no debe quedar hardcodeado en la aplicación pública.
- RLS, autorización server-side, migraciones Git, audit log y snapshots de precio son
  obligatorios.
- Cloudinary preserva originales; no hay background removal automático/destructivo.
- WhatsApp/config/templates se separan por unidad y viven en settings.
- Legal de Import no hereda automáticamente las políticas de Parfums.
- n8n y automatización masiva quedan fuera del núcleo V1.
- Paleta compartida: negro, blanco/ivory y dorado; storefront editorial de lujo.

## UNKNOWN

- Procedimiento seguro de bootstrap del primer admin, contraseña inicial, MFA,
  recuperación, alta de administradores adicionales y futuros roles/permisos.
- Dominio final, cuentas/proyectos de Vercel, Supabase, Cloudinary y Resend.
- Cuáles de los 23 precios de frasco actuales están confirmados para publicar.
- Reglas comerciales futuras del builder personalizado.
- Categorías y catálogo inicial de Import; datos comerciales y fuente de cada registro.
- Campos definitivos para relojes u otras categorías.
- Moneda(s), impuestos y si Import muestra precio final, estimado o solo consulta.
- Checkout de cada unidad: solo WhatsApp, registro previo del pedido o pago futuro.
- Estados de pedido, transiciones, cancelación y responsables operativos.
- Reglas de pago, adelanto, cancellation, lead time, refund, disponibilidad, garantía,
  shipping y entrega para Import.
- Si `opens_at`/`closes_at` cambian el estado automáticamente o solo informan al admin.
- Zona horaria contractual de campañas (la operación actual está en Lima, pero confirmar).
- Si puede haber varios consolidados abiertos y cuál prioriza el gateway.
- Alcance/unicidad de `campaign.number` y regla para “duplicate previous”.
- Qué campaña/fecha mostrar como “próximo consolidado” cuando hay varias programadas.
- Campos requeridos, consentimiento, retención y canal de la waitlist.
- WhatsApp final de Parfums e Import y texto aprobado de cada template.
- Regla de inventario: cantidad exacta, solo estado, reservas, oversell o backorder.
- SKU/barcode y clave estable usada para matching de CSV.
- Quién aprueba un diff CSV y política de conflictos/unmatched.
- Reglas de archive/hard-delete, retención de pedidos, PII y audit logs.
- Si los pedidos requieren fecha de nacimiento u otro dato adicional del comprador.
- Políticas legales finales de Import y fecha de aprobación del cliente.
- Eventos analytics, proveedor, consentimiento/cookies y criterio de éxito.
- Emails de waitlist/campaña/pedido que realmente se usarán y dominio remitente.
- Si se mantiene PWA/offline en V2.
- Fecha, ventana y responsable del cutover/rollback de producción.

## DECIDED TECHNICALLY

- V2 aislada en `apps/web`; App Router + TypeScript estricto; master queda intacta.
- Una sola aplicación, sin Turborepo ni segundo repositorio en V1.
- Route groups/layouts separan gateway, storefronts y admin sin separar plataforma.
- Postgres será fuente canónica después del cutover; `assets/data.js` se migra por ETL.
- UUID como PK y `legacy_id` para redirects/soporte.
- Variantes modelan tamaños/frascos; categoría usa JSONB validado solo para specs variables.
- Dinero usa decimal + moneda; pedidos guardan snapshots inmutables.
- Productos se archivan por defecto; no hard-delete con historia.
- Campaña guarda oferta propia en `campaign_products`; cerrar no muta pedidos.
- Dos stores/keys de carrito; el servidor recalcula precios al crear pedido.
- Acceso público solo a filas/campos publicados; mutaciones pasan por servidor + RLS.
- Upload Cloudinary firmado; secretos solo en servidor; migración por manifiesto/checksum.
- CSV usa staging + diff + confirmación + transacción + audit log.
- Redirects temporales en Preview; permanentes solo después del gate completo.
- No se implementan reglas automáticas de campaña, emails o analytics sin confirmar.

## CLIENT_PROVIDED_PENDING_RECONFIRMATION

- Las composiciones actuales de los tres combos pueden reproducirse durante la paridad
  legacy, pero no se consideran catálogo comercial verificado ni seed futuro.
- Los 23 precios de frasco y los demás precios de `assets/data.js` pueden mostrarse para
  paridad con `verificationStatus: legacy`; no quedan aprobados para carga automática a
  Supabase.
