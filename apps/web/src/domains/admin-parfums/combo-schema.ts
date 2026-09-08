/**
 * Server-side validation for the Admin Parfums combo module.
 *
 * Same house style as product-schema.ts/category-schema.ts: pure, dependency
 * -free, discriminated result types, never throws. No Zod — see
 * product-schema.ts's header comment for why this project does not use a
 * schema library.
 */

import { isValidUuid, type FieldErrors, type ValidationResult } from "./product-schema";
export { isValidExpectedTimestamp } from "./category-schema";

const VERIFICATION_STATUSES = ["pending_reconfirmation", "client_confirmed", "unknown"] as const;

export type CompositionVerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export function isVerificationStatus(value: unknown): value is CompositionVerificationStatus {
  return typeof value === "string" && (VERIFICATION_STATUSES as readonly string[]).includes(value);
}

/** Copy shown in the Admin UI — never "verified"/"confirmed" by default, and
 * never the raw enum value. */
export const VERIFICATION_STATUS_LABELS: Record<CompositionVerificationStatus, string> = {
  pending_reconfirmation: "Pendiente de reconfirmación",
  client_confirmed: "Confirmado por cliente",
  unknown: "Desconocido",
};

export type ComboCreateInput = {
  productId: string;
  compositionVerificationStatus: CompositionVerificationStatus;
};

/** Defaults to pending_reconfirmation — client_confirmed is never inferred,
 * only ever chosen explicitly by whoever submits the form. */
export function validateComboCreateForm(input: {
  productId?: unknown;
  compositionVerificationStatus?: unknown;
}): ValidationResult<ComboCreateInput> {
  const errors: FieldErrors = {};

  const productId = typeof input.productId === "string" ? input.productId : "";
  if (!isValidUuid(productId)) {
    errors.productId = "Selecciona un producto elegible.";
  }

  const rawStatus =
    input.compositionVerificationStatus === undefined || input.compositionVerificationStatus === ""
      ? "pending_reconfirmation"
      : input.compositionVerificationStatus;
  if (!isVerificationStatus(rawStatus)) {
    errors.compositionVerificationStatus = "Selecciona un estado de verificación válido.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      productId,
      compositionVerificationStatus: rawStatus as CompositionVerificationStatus,
    },
  };
}

export function validateVerificationStatusInput(
  value: unknown,
): ValidationResult<CompositionVerificationStatus> {
  if (!isVerificationStatus(value)) {
    return { ok: false, errors: { compositionVerificationStatus: "Selecciona un estado de verificación válido." } };
  }
  return { ok: true, value };
}

export type ComboItemInput = {
  productVariantId: string;
  quantity: number;
  sortOrder: number;
};

const MAX_QUANTITY = 999;
const MAX_ITEMS = 200;

/**
 * Validates a full composition replace. The client always submits the whole
 * desired array (add/remove/reorder are local state until "Guardar
 * composición"), so this has no partial-patch ambiguity to resolve — same
 * reasoning as validateProductForm's full-replace design.
 */
export function validateComboItems(rawItems: unknown): ValidationResult<ComboItemInput[]> {
  const errors: FieldErrors = {};

  if (!Array.isArray(rawItems)) {
    return { ok: false, errors: { items: "La composición enviada no es válida." } };
  }
  if (rawItems.length > MAX_ITEMS) {
    return { ok: false, errors: { items: `Un combo no puede tener más de ${MAX_ITEMS} líneas.` } };
  }

  const seen = new Set<string>();
  const parsed: ComboItemInput[] = [];

  rawItems.forEach((raw, index) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const key = `items.${index}`;

    const productVariantId = typeof item.productVariantId === "string" ? item.productVariantId : "";
    if (!isValidUuid(productVariantId)) {
      errors[`${key}.productVariantId`] = "Selecciona una variante válida.";
      return;
    }
    if (seen.has(productVariantId)) {
      errors[`${key}.productVariantId`] = "Esta variante ya está en la composición.";
      return;
    }
    seen.add(productVariantId);

    // Number(null)/Number("") are both 0 — reject a missing quantity
    // explicitly rather than silently defaulting it, same guard as
    // product-schema.ts's parseMoney/quantityOnHand.
    let quantity = NaN;
    if (item.quantity !== null && item.quantity !== undefined && item.quantity !== "") {
      quantity = typeof item.quantity === "number" ? item.quantity : Number(item.quantity);
    }
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
      errors[`${key}.quantity`] = "La cantidad debe ser un entero mayor que 0.";
    }

    const rawSortOrder = item.sortOrder;
    const sortOrder =
      rawSortOrder === undefined || rawSortOrder === "" ? index : Number(rawSortOrder);
    if (!Number.isInteger(sortOrder)) {
      errors[`${key}.sortOrder`] = "El orden debe ser un entero.";
    }

    parsed.push({ productVariantId, quantity, sortOrder });
  });

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: parsed };
}
