import { isValidUuid, type FieldErrors, type ValidationResult } from "../admin-parfums/product-schema";

const AVAILABILITY_STATUSES = ["available", "out_of_stock"] as const;
export type CampaignProductAvailability = (typeof AVAILABILITY_STATUSES)[number];

export const AVAILABILITY_LABELS: Record<CampaignProductAvailability, string> = {
  available: "Disponible",
  out_of_stock: "Agotado",
};

export function isCampaignProductAvailability(value: unknown): value is CampaignProductAvailability {
  return typeof value === "string" && (AVAILABILITY_STATUSES as readonly string[]).includes(value);
}

export type CampaignProductItemInput = {
  productId: string;
  productVariantId: string | null;
  priceAmount: number;
  availabilityStatus: CampaignProductAvailability;
  quantityLimit: number | null;
  sortOrder: number;
};

const MAX_ITEMS = 500;

function parseMoney(value: unknown, field: string, errors: FieldErrors): number | null {
  if (value === null || value === undefined || value === "") {
    errors[field] = "Ingresa un monto válido.";
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    errors[field] = "Ingresa un monto válido.";
    return null;
  }
  if (parsed < 0) {
    errors[field] = "El monto no puede ser negativo.";
    return null;
  }
  return Math.round(parsed * 100) / 100;
}

/**
 * Validates a full campaign_products replace. Same full-replace design as
 * validateComboItems: the client always submits the whole desired set, so
 * there is no partial-patch ambiguity. currency is never accepted here —
 * it is always 'PEN' at the RPC layer, never a client-controlled value.
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

    const dedupeKey = `${productId}::${productVariantId ?? ""}`;
    if (seen.has(dedupeKey)) {
      errors[`${key}.productId`] = "Este producto (y variante) ya está en la lista.";
      return;
    }
    seen.add(dedupeKey);

    const priceAmount = parseMoney(item.priceAmount, `${key}.priceAmount`, errors);

    const availabilityStatus = isCampaignProductAvailability(item.availabilityStatus)
      ? item.availabilityStatus
      : "available";

    let quantityLimit: number | null = null;
    if (item.quantityLimit !== null && item.quantityLimit !== undefined && item.quantityLimit !== "") {
      const parsedLimit = typeof item.quantityLimit === "number" ? item.quantityLimit : Number(item.quantityLimit);
      if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
        errors[`${key}.quantityLimit`] = "El límite debe ser un entero mayor que 0, o dejarse vacío.";
      } else {
        quantityLimit = parsedLimit;
      }
    }

    const sortOrder = Number.isInteger(item.sortOrder) ? (item.sortOrder as number) : index;

    if (priceAmount === null) return;
    parsed.push({ productId, productVariantId, priceAmount, availabilityStatus, quantityLimit, sortOrder });
  });

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: parsed };
}
