# Cruzial Platform V2 — Client decisions

Última actualización: 2026-09-08 (checkout/pagos y mayorista threshold).
Una entrada `UNKNOWN` nunca es una regla de negocio. Cuando una decisión más
nueva contradice una anterior, la más nueva (LATEST) gana — se documenta el
reemplazo, no se borra el historial a ciegas.

## CONFIRMED — 2026-09-08 (checkout/pagos y mayorista threshold — LATEST)

- **Checkout: WhatsApp-only, sin cobro en la página.** Tanto Parfums como
  Import siguen `cart → checkout → validación server-side → crear/registrar
  order request → status pending_whatsapp_confirmation → abrir WhatsApp con
  mensaje prellenado`. La coordinación de pago/adelanto ocurre fuera del
  sitio, por WhatsApp. **No implementar** Culqi, Mercado Pago, Stripe, API de
  Yape/Plin, cobro con tarjeta, webhooks de pago ni un estado de "pago
  confirmado" — abrir WhatsApp nunca equivale a pago confirmado. Copy
  aprobado: "Tu solicitud fue registrada. Termina la coordinación por
  WhatsApp." Import conserva su regla de adelanto (nuevo 50% / recurrente
  70%) como dato a calcular/snapshotear para la coordinación por WhatsApp —
  la web no cobra ese adelanto.
- **`wholesaleThresholdScope`: CONFIRMED — por `commercial_type`, no por
  producto ni por pedido global.** La elegibilidad de mayorista se acumula
  dentro de una misma categoría comercial (`kind = commercial_type`):
  árabe, designer y nicho no se mezclan entre sí, pero productos distintos
  dentro de la misma categoría sí se combinan hacia el umbral de 40
  unidades. Ejemplo válido: 20 Yara Pink + 10 Khamrah Qahwa + 10 9PM = 40
  árabes → aplica el descuento árabe. Ejemplo inválido: 20 árabes + 10
  designer + 10 nicho = 40 unidades en total pero ninguna categoría llega
  sola a 40 → no aplica ningún descuento. Descuentos por unidad elegible al
  alcanzar el umbral: árabe −S/5, designer −S/7, nicho −S/10. Solo participan
  variantes de frasco completo elegibles para mayorista. El matching debe
  usar la identidad estable de categoría (`kind = commercial_type`), nunca
  parsing de etiquetas de UI. El schema actual de `wholesale_policies`
  (scope `per_product | per_order | unconfirmed`) no representa todavía
  `per_category`/`per_commercial_type` — Fase 4D (Wholesale Admin) debe
  introducir esa representación mínima de forma **aditiva**, sin alterar el
  scope model existente en este checkpoint.
- **Consolidados — comportamiento confirmado (registro, sin implementación
  nueva en este checkpoint).** Cada consolidado es una campaña independiente
  que abre y cierra; el siguiente consolidado puede tener productos, precios
  y disponibilidad distintos; los consolidados históricos nunca se
  sobrescriben. La arquitectura `campaigns`/`campaign_products` ya vigente
  soporta esto y se mantiene sin cambios. Pertenece a trabajo futuro de
  Import, no a Wholesale Admin. El PDF de 76 páginas de consolidados
  históricos no se procesó en este checkpoint (fuera de alcance explícito).

## CONFIRMED — 2026-09-07 (contacto y paleta — LATEST, reemplaza 2026-09-06)

- **WhatsApp**: `+51 926 390 591` (E.164 `51926390591`), reemplaza
  `51924590921`. Único número inicial para Parfums e Import, pero cada
  unidad tiene su propio objeto de settings
  (`domains/platform/settings.ts`) — no un valor global compartido —
  para poder divergir sin tocar la otra unidad.
- **`PUBLIC_CONTACT_EMAIL`**: `dominiocruzial@gmail.com`, correo comercial
  visible para contacto público (nuevo campo, no existía antes en
  `CRUZIAL_CONFIG`).
- **Paleta Parfums**: **negro + blanco**. El dorado deja de ser color de
  UI dominante (pills/botones/precios/bordes); puede permanecer dentro del
  logo o de fotografías. Aplicado progresivamente — ver
  `docs/progress-v2.md` para qué superficies ya migraron.
- **Paleta Import**: azul profundo + blanco + plata, ya establecida en la
  ronda anterior — confirmado explícitamente: sin rojo, sin dorado
  dominante, no es "Parfums recoloreado".

## CONFIRMED — 2026-09-06 (Fase 2.5, catálogo)

Verificadas contra `assets/data.js` y, donde aplica, contra fotografía real del
producto (`img/perfumes/webp/*`) antes de aplicarse. Provenance: `CLIENT_CONFIRMED`
+ `DERIVED_VALIDATED` (foto) donde se indica.

- **`red-intensely`**: la etiqueta de la botella dice "NITRO Pour Homme red
  intensely" (`img/perfumes/webp/Lattafa Red Intensely.webp`, nombre de archivo
  heredado engañoso). Marca corregida `Lattafa` → `Dumont Paris`; nombre
  `Red Intensely` → `Nitro Red Intensely`. No confundir con `nitro-red`
  (Dumont Paris, "Nitro Red" sin "Intensely"), que ya era correcto y no cambia.
  DERIVED_VALIDATED (foto) + CLIENT_CONFIRMED.
- **`reserve-privee`**: la etiqueta de la botella dice "GENTLEMAN GIVENCHY"
  (`img/perfumes/webp/Armani Reserve Privée.webp`, nombre de archivo heredado
  engañoso). Marca corregida `Armani` → `Givenchy`; nombre
  `Reserve Privée` → `Gentleman Réserve Privée`. `legacy_id` sin cambios.
  DERIVED_VALIDATED (foto) + CLIENT_CONFIRMED.
- **`purple-melancholia`** (Valentino, ya `CLIENT_CONFIRMED` 2026-08-30 en
  marca): clasificación comercial `type` corregida `niche` → `designer`.
  CLIENT_CONFIRMED 2026-09-06. **Re-verificado 2026-09-07**: es el ÚNICO
  registro con `brand: "Valentino"` en todo `assets/data.js` (grep
  exhaustivo) — no existe un segundo producto Valentino mal clasificado.
  Foto comparada: `img/perfumes/webp/Purple Melancholia.webp` (desplegada)
  vs. `img/perfumes/VALENTINO - VALENTINO MELANCHOLIA.png` (original nuevo,
  untracked) — mismo frasco (Valentino Born In Roma Uomo Intense, rockstud
  negro-a-morado), misma etiqueta "VALENTINO". La foto desplegada no está
  dañada; no se sustituye. `type: designer` es la única corrección que
  correspondía a Valentino y ya se aplicó.
- **`bir-intense`** (Burberry Brit Intense): el cliente confirmó que no lo
  tiene en inventario. Se marca `hidden: true` (nuevo campo) y se retira de
  catálogo, Finder, relacionados, búsqueda, mayorista y sitemap futuro. No se
  borra el registro — se preserva procedencia legacy. CLIENT_CONFIRMED.
- **`cdn-preciux-i`** (Armaf): la etiqueta de la botella dice
  "club de nuit precieux I" — el campo `name` decía "Club de Nuit Precious I"
  (error de ortografía, no de marca). Corregido a "Club de Nuit Precieux I"
  para igualar la propia botella del producto. No es "Moudon Précieux" (marca
  distinta) — ver UNKNOWN abajo sobre esa confusión. DERIVED_VALIDATED (foto).
- **`amber-o-gold-e`** (Al Haramain): la etiqueta de la botella dice
  "HARAMAIN AMBER OUD GOLD EDITION" — el campo `name` decía
  "Amber Oud Gold Elixir" (coincide con el archivo de imagen existente, que ya
  usaba "EDITION"). Corregido a "Amber Oud Gold Edition". Esto probablemente
  explica la nota ambigua del cliente "Amber Gold Elixir es E[dition]" — ver
  UNKNOWN abajo para la parte de esa nota que sigue sin poder confirmarse con
  certeza. DERIVED_VALIDATED (foto + nombre de archivo).
- **`supremacy-noi`** (Afnan, marca ya correcta): nombre expandido
  `Supremacy NOI` → `Supremacy Not Only Intense` para igualar el nombre
  completo que confirmó el cliente. CLIENT_CONFIRMED.
- **`sceptre-malachite`** (Maison Alhambra): foto verificada contra
  `img/perfumes/transparent/MAISON ALHAMBRA - SCEPTRE MALACHITE.webp` — la
  etiqueta dice "SCEPTRE MALACHITE / MAISON ALHAMBRA", coincide exactamente
  con marca/nombre ya almacenados. La foto NO está dañada ni es incorrecta;
  no se modifica nada. **CLIENT_ASSET_MISSING (confirmado 2026-09-07)**:
  búsqueda exhaustiva de candidatos nuevos (`git status`, `find img -iname
  "*sceptre*" -o -iname "*spectre*" -o -iname "*malachite*" -o -iname
  "*alhambra*"`) no encuentra ningún archivo nuevo/untracked destinado a
  sustituir esta foto — solo aparece la ya desplegada. El cliente pidió
  "cambiar la foto" pero no ha subido ningún reemplazo todavía; no se
  descarga una foto de Internet para llenar ese vacío. Pendiente: que el
  cliente suba el archivo correcto si de verdad quiere reemplazarla.
- **Envíos Parfums**: `Olva` no se usa en ningún runtime de V2 (`apps/web/src`
  no lo menciona). El sitio legacy estático (`assets/data.js`,
  `checkout.html`, `index.html`, etc.) sí lo menciona junto a Shalom; se
  corrige `CRUZIAL_CONFIG.DELIVERY` en `assets/data.js` para mostrar solo
  Shalom. Se añade un grep-gate en V2 para evitar que reaparezca.

## CONFIRMED

- Marca paraguas: CRUZIAL; unidades: CRUZIAL PARFUMS y CRUZIAL IMPORT.
- Una plataforma: `/`, `/parfums`, `/import`, `/admin`; infraestructura compartida.
- Parfums mantiene entrega inmediata, decants, sellados, combos y mayorista.
- Import es multicategoría; relojes es solo una categoría posible.
- Consolidado es campaña temporal con estados draft/scheduled/open/paused/closed/fulfilled.
- Sales modes: campaign, always_available y catalog_only (o equivalente).
- Carritos Parfums e Import deben permanecer separados.
- V1 tiene admin-only auth y no ofrece signup público.
- **`ADMIN_BOOTSTRAP_EMAIL`**: `cruzialof@gmail.com`. Es exclusivamente un
  dato de aprovisionamiento del primer administrador y no debe quedar
  hardcodeado en el frontend público ni confundirse con `PUBLIC_CONTACT_EMAIL`.
- RLS, autorización server-side, migraciones Git, audit log y snapshots de precio son
  obligatorios.
- Cloudinary preserva originales; no hay background removal automático/destructivo.
- WhatsApp/config/templates se separan por unidad y viven en settings.
- Legal de Import no hereda automáticamente las políticas de Parfums.
- n8n y automatización masiva quedan fuera del núcleo V1.

## SUPERSEDED — reemplazado por decisiones LATEST de 2026-09-07

- **Paleta compartida negro/blanco/ivory/dorado:** fue una dirección histórica
  de Fase 0 y ya no es una regla visual vigente. Parfums usa negro + blanco con
  dorado no dominante; Import usa azul profundo + blanco + plata y no es
  Parfums recoloreado.

## CONFIRMED — 2026-09-06 (Fase 2.5, reglas de negocio)

- **Descontinuado ≠ agotado**: "los descontinuados ya no se fabrican pero
  nosotros sí lo tenemos". `productionStatus: discontinued` no implica
  `availabilityStatus: out_of_stock`. Un producto puede ser
  `discontinued` + `available` y debe seguir siendo comprable. Ningún
  producto actual tiene evidencia de `out_of_stock` real; no se inventa esa
  cantidad.
- **Promoción de regalo (decant 2 ml) solo aplica a frasco completo**: "la
  promo que aparece en la página de producto solamente es por el frasco
  completo". No es elegible con 3/5/10 ml. Regla centralizada en
  `domains/catalog/promotion-eligibility.ts`, consumida por Product Detail y
  el banner de catálogo — no duplicada.
- **Product Card**: el cliente quiere elegir cantidad desde la card
  (control `- N +`, mínimo 1, mismas reglas de merge que el carrito).
- **Combo Builder**: el tamaño es por línea/fragancia, no global. Cambiar el
  tamaño de una fragancia no debe afectar a las demás del mismo combo.
- **Mayorista — nueva línea de producto confirmada**: 9PM, Mandarin Sky,
  Khamrah Clásico, Khamrah Qahwa, Sublime, Yara Candy, Yara Pink.
- **Mayorista — descuentos por categoría confirmados**: árabe −S/5,
  designer −S/7, nicho −S/10, sobre 40 unidades. Ver UNKNOWN abajo sobre el
  alcance exacto de "40 unidades" (combinadas vs. por SKU) — no se calcula
  como regla contractual hasta confirmar el alcance.
- **Import — adelanto**: cliente nuevo 50%, cliente antiguo 70%. Vive en
  configuración comercial de Import, no de Parfums. La verificación de
  "cliente antiguo" no puede depender solo de una declaración del navegador;
  requiere `customerStatus: new | returning | unverified` sujeto a
  validación server-side/admin cuando exista historial de pedidos.
- **Import — envío**: "delivery privado" (`private_delivery`), no hereda
  Shalom de Parfums. Shipping methods modelados por unidad de negocio.

## UNKNOWN

- Procedimiento seguro de bootstrap del primer admin, contraseña inicial, MFA,
  recuperación, alta de administradores adicionales y futuros roles/permisos.
- Dominio final, cuentas/proyectos de Vercel, Supabase, Cloudinary y Resend.
- Cuáles de los 23 precios de frasco actuales están confirmados para publicar.
- Reglas comerciales futuras del builder personalizado.
- Categorías y catálogo inicial de Import; datos comerciales y fuente de cada registro.
- Campos definitivos para relojes u otras categorías.
- Moneda(s), impuestos y si Import muestra precio final, estimado o solo consulta.
- Estados de pedido, transiciones, cancelación y responsables operativos.
- Reglas de cancellation, lead time, refund, disponibilidad, garantía, shipping
  y entrega para Import (el mecanismo de checkout/adelanto en sí ya es
  CONFIRMED — ver 2026-09-08 arriba).
- Si `opens_at`/`closes_at` cambian el estado automáticamente o solo informan al admin.
- Zona horaria contractual de campañas (la operación actual está en Lima, pero confirmar).
- Si puede haber varios consolidados abiertos y cuál prioriza el gateway.
- Alcance/unicidad de `campaign.number` y regla para “duplicate previous”.
- Qué campaña/fecha mostrar como “próximo consolidado” cuando hay varias programadas.
- Campos requeridos, consentimiento, retención y canal de la waitlist.
- Si en el futuro Parfums e Import tendrán números distintos y cuál será el
  texto aprobado de cada template por flujo. El número operativo actual de
  ambas unidades sí está **CONFIRMED**: `+51 926 390 591` / `51926390591`;
  los objetos de settings permanecen separados para permitir divergencia.
- Regla de inventario: cantidad exacta, solo estado, reservas, oversell o backorder.
- SKU/barcode y clave estable usada para matching de CSV.
- Quién aprueba un diff CSV y política de conflictos/unmatched.
- Reglas de archive/hard-delete, retención de pedidos, PII y audit logs.
- Si los pedidos requieren fecha de nacimiento u otro dato adicional del comprador.
- Políticas legales finales de Import y fecha de aprobación del cliente.
- **`1-million-lucky` — RESUELTO PARCIALMENTE 2026-09-07**: único producto
  del catálogo con "Million"/"Lucky" en el nombre (grep exhaustivo en
  `assets/data.js`, sin homónimos ni segundo registro "1 Million" base). La
  foto (verificada 2026-09-06) muestra inequívocamente "1 MILLION LUCKY" —
  es la variante Lucky, no el perfume base "1 Million". Corrección aplicada
  sin cambiar identidad: `name` "1 Million Lucky" → **"One Million Lucky"**
  (numeral → palabra, "Lucky" se conserva porque es lo que confirma la
  foto). `legacy_id`/slug sin cambios. CLIENT_CONFIRMED (instrucción literal
  "1 million a one million") + DERIVED_VALIDATED (foto).
  **UNKNOWN_CLIENT_CLARIFICATION restante**: si el cliente en realidad
  quería el perfume base "1 Million" (sin "Lucky") — ese producto no existe
  en el catálogo actual y no se inventa. No renombrar a "One Million" a
  secas mientras eso no se confirme explícitamente.
- **UNKNOWN_CLIENT_CLARIFICATION — `cdn-preciux-i` / "Précieux"**: el
  producto real es "Club de Nuit Precieux I" (Armaf); no hay ningún registro
  "Moudon Précieux" en el catálogo. Se corrigió solo la ortografía de la
  propia botella (Precious → Precieux); no se reasigna a otra marca por
  fuzzy match.
- **UNKNOWN_CLIENT_CLARIFICATION — "Amber Gold Elixir es E."**: se corrigió
  el nombre a "Amber Oud Gold Edition" por evidencia fotográfica directa
  (coincide con archivo de imagen ya existente), pero no puede confirmarse
  con certeza si la nota "E." del cliente se refería además a marca,
  categoría o género — no se infiere nada adicional sobre esos campos.
- **UNKNOWN — fragmento "reserva para..."**: no existe ningún texto con ese
  fragmento en el repositorio (grep sin resultados en HTML, `data.js` ni
  docs). No se puede completar sin que el cliente aporte el texto completo.
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

## LEGACY_LEGAL_PENDING_REVIEW (por revisar humano/legal)

- El sitio legacy declara en legal el uso de Google Analytics, Meta Pixel y herramientas
  de IA. En V2 esas integraciones aún no existen en runtime; se omitieron de las páginas
  de Privacidad/Términos para no publicar servicios inactivos. Si en cutover se introducen
  (analytics, pixel o IA), reintroducir las cláusulas correspondientes tras confirmación.
- Cláusulas de Términos legacy que requieren revisión legal antes de publicarse como
  hecho operativo: tiempos de entrega ("mismo día / siguiente día hábil", "2-7 días"),
  política de devoluciones (sin cambios una vez sellado; reemplazo solo por defecto o
  envío incorrecto) y promoción de decant 2 ml. Se conservan por parity con copy legacy,
  marcadas para reconfirmación.
