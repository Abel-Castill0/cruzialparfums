import type { Json } from "@/lib/supabase/database.types";

/**
 * Human-facing labels for the audit log (Phase 4G2).
 *
 * The action/entity vocabulary is append-only across migrations (see
 * audit_log_action_check in supabase/migrations/20260907154355_audit_log.sql
 * and its later ALTERs) — new values get added over time by mutation RPCs
 * this UI does not know about yet. Every lookup here therefore degrades to
 * a readable fallback instead of crashing on an unrecognized value: the raw
 * string, lightly humanized, rather than a thrown error or a blank cell.
 */

const ACTION_LABELS: Record<string, string> = {
  create: "Creación",
  update: "Actualización",
  archive: "Archivado",
  restore: "Restaurado",
  publish: "Publicado",
  unpublish: "Despublicado",
  price_change: "Cambio de precio",
  inventory_change: "Cambio de inventario",
  campaign_state_change: "Cambio de estado de campaña",
  order_state_change: "Cambio de estado de pedido",
  settings_change: "Cambio de configuración",
  membership_change: "Cambio de membresía",
  customer_verification_change: "Cambio de verificación de cliente",
  composition_update: "Actualización de composición",
  verification_update: "Actualización de verificación",
  "wholesale.policy_update": "Actualización de regla mayorista",
  "wholesale.enable": "Activación mayorista",
  "wholesale.disable": "Desactivación mayorista",
  primary_change: "Cambio de imagen principal",
  reorder: "Reordenamiento",
};

const ENTITY_LABELS: Record<string, string> = {
  product: "Producto",
  product_variant: "Variante",
  inventory: "Inventario",
  product_categories: "Categorías del producto",
  category: "Categoría",
  combo: "Combo",
  wholesale_policy: "Regla mayorista",
  product_media: "Media del producto",
  settings: "Configuración",
};

/** Turns an unrecognized snake_case/dot value into a readable fallback
 * ("foo_bar.baz" → "Foo bar baz") instead of showing the raw enum. Known
 * values always use the curated label above; this only runs for values
 * this UI has not been taught about yet. */
function humanizeUnknown(value: string): string {
  const words = value.replace(/[._]/g, " ").trim();
  if (!words) return value;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? humanizeUnknown(action);
}

export function entityTypeLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? humanizeUnknown(entityType);
}

export const KNOWN_ACTIONS: readonly string[] = Object.keys(ACTION_LABELS);
export const KNOWN_ENTITY_TYPES: readonly string[] = Object.keys(ENTITY_LABELS);

/** Curated field-name labels for the entities this phase knows how to
 * render a diff for. Anything not listed here still renders — the field
 * key itself, lightly humanized — it just does not get a Spanish label. */
const FIELD_LABELS: Record<string, string> = {
  name: "Nombre",
  slug: "Slug",
  brand: "Marca",
  short_description: "Descripción corta",
  description: "Descripción",
  gender: "Género",
  concentration: "Concentración",
  sales_mode: "Modalidad de venta",
  production_status: "Estado de producción",
  publication_status: "Estado de publicación",
  is_featured: "Destacado",
  featured_rank: "Posición destacada",
  price_amount: "Precio",
  currency: "Moneda",
  sku: "SKU",
  variant_kind: "Tipo de variante",
  size_ml: "Tamaño (ml)",
  sort_order: "Orden",
  inventory_mode: "Modalidad de inventario",
  availability_status: "Disponibilidad",
  stock_quantity: "Cantidad en stock",
  is_primary: "Imagen principal",
  alt_text: "Texto alternativo",
  archived_at: "Archivado el",
  is_active: "Activo",
  whatsapp_number: "Número de WhatsApp (E.164)",
  whatsapp_display: "Número de WhatsApp (visible)",
  contact_email: "Correo de contacto",
  value: "Valor",
};

/** Field names that must never be rendered even if they somehow appear in
 * a before/after snapshot — deep defense in case a future mutation ever
 * touches a table with a column like this. Matched case-insensitively as a
 * substring so "api_key", "apiKey", "secret_token", etc. all match. */
const SENSITIVE_FIELD_PATTERN = /password|secret|token|api[-_]?key|credential/i;

export type FieldChange = { field: string; label: string; before: string; after: string };

function isSensitiveField(field: string): boolean {
  return SENSITIVE_FIELD_PATTERN.test(field);
}

function stringifyValue(value: Json | undefined): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value === "" ? "—" : value;
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") return String(value);
  // Object/array leaves — bounded by MAX_JSON_PREVIEW_CHARS below so an
  // unexpectedly large nested value cannot flood the page.
  const json = JSON.stringify(value);
  return json.length > 200 ? `${json.slice(0, 200)}…` : json;
}

const MAX_FIELD_CHANGES = 40;

/**
 * Computes a bounded, readable list of field-level changes between two
 * snapshots. Never returns the raw JSON for the caller to dump — every
 * value passes through stringifyValue's length cap, and any sensitive key
 * name is redacted outright regardless of what it holds.
 */
export function computeFieldChanges(
  before: Json | null,
  after: Json | null,
): { changes: FieldChange[]; truncated: boolean } {
  const beforeObj = before && typeof before === "object" && !Array.isArray(before) ? before as Record<string, Json> : {};
  const afterObj = after && typeof after === "object" && !Array.isArray(after) ? after as Record<string, Json> : {};
  const keys = Array.from(new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)])).sort();

  const changes: FieldChange[] = [];
  for (const key of keys) {
    const beforeValue = beforeObj[key];
    const afterValue = afterObj[key];
    if (JSON.stringify(beforeValue) === JSON.stringify(afterValue)) continue;

    if (isSensitiveField(key)) {
      changes.push({ field: key, label: FIELD_LABELS[key] ?? humanizeUnknown(key), before: "•••• (oculto)", after: "•••• (oculto)" });
      continue;
    }

    changes.push({
      field: key,
      label: FIELD_LABELS[key] ?? humanizeUnknown(key),
      before: stringifyValue(beforeValue),
      after: stringifyValue(afterValue),
    });
  }

  const truncated = changes.length > MAX_FIELD_CHANGES;
  return { changes: changes.slice(0, MAX_FIELD_CHANGES), truncated };
}

/** One-line summary for the list view — never the full diff, just enough to
 * orient without opening the detail. Falls back to a generic phrase for an
 * entity/action combination this UI does not have specific copy for. */
export function summarizeEntry(entityType: string, action: string, entityId: string | null): string {
  const entity = entityTypeLabel(entityType);
  const act = actionLabel(action);
  const idSuffix = entityId ? ` (${entityId.slice(0, 8)}…)` : "";
  return `${act} · ${entity}${idSuffix}`;
}
