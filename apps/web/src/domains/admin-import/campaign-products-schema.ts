import { isValidUuid, type FieldErrors, type ValidationResult } from "../admin-parfums/product-schema";

const AVAILABILITY_STATUSES = ["unconfirmed", "available", "out_of_stock"] as const;
export type CampaignProductAvailability = (typeof AVAILABILITY_STATUSES)[number];

export const AVAILABILITY_LABELS: Record<CampaignProductAvailability, string> = {
  unconfirmed: "Por confirmar",
  available: "Disponible",
  out_of_stock: "Agotado",
};

export function isCampaignProductAvailability(value: unknown): value is CampaignProductAvailability {
  return typeof value === "string" && (AVAILABILITY_STATUSES as readonly string[]).includes(value);
}

/**
 * Canonical decimal-text money contract (4J2 correction). Campaign prices
 * are commercial authority and must never pass through JS binary-float
 * arithmetic anywhere on the TypeScript/UI/action/repository boundary — the
 * database column is numeric(12,2), and every hop up to it must carry the
 * exact same decimal text a human typed, normalized only by string
 * operations (zero-padding), never Number()/Math.round(). "16.00",
 * "129.90", "0.00" are the canonical shape: 1-10 integer digits (numeric
 * (12,2) allows at most 10 digits before the point), an optional '.', and
 * 1-2 fraction digits. No sign, no scientific notation, no thousands
 * separators — anything outside that syntax is a validation error, not a
 * best-effort coercion.
 */
const MONEY_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/;

export function isValidMoneyText(value: unknown): value is string {
  return typeof value === "string" && MONEY_PATTERN.test(value.trim());
}

/** Normalizes an already-valid money text to exactly 2 fraction digits via
 * string padding only — "16" -> "16.00", "16.5" -> "16.50". Never touches
 * the integer part, never routes through Number(). */
export function normalizeMoneyText(value: string): string {
  const trimmed = value.trim();
  const [whole, fraction = ""] = trimmed.split(".");
  return `${whole}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

function parseMoney(value: unknown, field: string, errors: FieldErrors): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    errors[field] = "Ingresa un monto válido.";
    return null;
  }
  if (!isValidMoneyText(value)) {
    errors[field] = "Ingresa un monto válido: solo dígitos y hasta 2 decimales, sin signo (ej. 16.50).";
    return null;
  }
  return normalizeMoneyText(value);
}

/**
 * quantity_limit is intentionally NOT part of this input type. It is not a
 * confirmed Import business feature (docs/client-decisions.md: exact
 * inventory/quantity-limit rules are UNKNOWN) and the browser must never be
 * able to set or overwrite it — admin_set_campaign_products preserves any
 * existing non-null value server-side and always sets NULL for a brand-new
 * association. See campaign-products-manager.tsx and the RPC in
 * supabase/migrations/20260909030000_admin_import_campaign_products_correction.sql.
 */
export type CampaignProductItemInput = {
  productId: string;
  productVariantId: string | null;
  importPresentationId: string | null;
  /** Canonical decimal text, e.g. "16.00" — never a JS number. */
  priceAmount: string;
  availabilityStatus: CampaignProductAvailability;
  sortOrder: number;
};

const MAX_ITEMS = 500;

/**
 * Validates a full campaign_products replace. Same full-replace design as
 * validateComboItems: the client always submits the whole desired set, so
 * there is no partial-patch ambiguity. currency is never accepted here —
 * it is always 'PEN' at the RPC layer, never a client-controlled value.
 * quantity_limit is never accepted here either (see CampaignProductItemInput).
 */
export function validateCampaignProductItems(rawItems: unknown): ValidationResult<CampaignProductItemInput[]> {
  const errors: FieldErrors = {};

  if (!Array.isArray(rawItems)) {
    return { ok: false, errors: { items: "La lista de productos enviada no es válida." } };
  }
  if (rawItems.length > MAX_ITEMS) {
    return { ok: false, errors: { items: `Un consolidado no puede tener más de ${MAX_ITEMS} líneas.` } };
  }

  const seen = new Set<string>();
  const parsed: CampaignProductItemInput[] = [];

  rawItems.forEach((raw, index) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const key = `items.${index}`;

    const productId = typeof item.productId === "string" ? item.productId : "";
    if (!isValidUuid(productId)) {
      errors[`${key}.productId`] = "Selecciona un producto válido.";
      return;
    }

    const productVariantId = typeof item.productVariantId === "string" && item.productVariantId
      ? item.productVariantId
      : null;
    if (productVariantId !== null && !isValidUuid(productVariantId)) {
      errors[`${key}.productVariantId`] = "Selecciona una variante válida.";
      return;
    }

    const importPresentationId = typeof item.importPresentationId === "string" && item.importPresentationId
      ? item.importPresentationId
      : null;
    if (importPresentationId !== null && !isValidUuid(importPresentationId)) {
      errors[`${key}.importPresentationId`] = "Selecciona una presentación válida.";
      return;
    }
    if (productVariantId !== null && importPresentationId !== null) {
      errors[`${key}.importPresentationId`] = "Una oferta no puede usar variante y presentación Import a la vez.";
      return;
    }

    const dedupeKey = `${productId}::${productVariantId ?? ""}::${importPresentationId ?? ""}`;
    if (seen.has(dedupeKey)) {
      errors[`${key}.productId`] = "Este producto con la misma presentación ya está en la lista.";
      return;
    }
    seen.add(dedupeKey);

    const priceAmount = parseMoney(item.priceAmount, `${key}.priceAmount`, errors);

    // Fail-closed: missing/null/malformed values are validation errors.
    if (!isCampaignProductAvailability(item.availabilityStatus)) {
      errors[`${key}.availabilityStatus`] = "Selecciona una disponibilidad válida (Por confirmar, Disponible o Agotado).";
      return;
    }
    const availabilityStatus = item.availabilityStatus;

    const sortOrder = Number.isInteger(item.sortOrder) ? (item.sortOrder as number) : index;

    if (priceAmount === null) return;
    parsed.push({ productId, productVariantId, importPresentationId, priceAmount, availabilityStatus, sortOrder });
  });

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: parsed };
}
