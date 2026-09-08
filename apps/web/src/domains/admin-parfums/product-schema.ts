/**
 * Server-side validation for the Admin Parfums product form.
 *
 * Pure and dependency-free on purpose: this project has never used a schema
 * library (every other domain — promotion-eligibility, catalog-query,
 * product-purchase — is hand-rolled TypeScript), and the only schema-shaped
 * package reachable from this repo is a transitive dependency of
 * eslint-config-next, not something to build product code on. Zod would add a
 * real runtime dependency to solve a problem plain functions already solve
 * for the rest of the codebase, so this file follows the existing house
 * style instead of introducing one.
 *
 * Every function here returns a discriminated result — never throws — so a
 * server action can turn a validation failure into a form-level error
 * message without a try/catch around business logic.
 */

export type FieldErrors = Record<string, string>;

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: FieldErrors };

const SALES_MODES = ["campaign", "always_available", "catalog_only"] as const;
const PRODUCTION_STATUSES = ["active", "discontinued"] as const;
const PUBLICATION_STATUSES = ["draft", "published", "archived"] as const;
const VARIANT_KINDS = ["decant", "bottle"] as const;
const INVENTORY_MODES = ["status_only", "tracked_quantity"] as const;
const AVAILABILITY_STATUSES = ["available", "out_of_stock"] as const;

export type SalesMode = (typeof SALES_MODES)[number];
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];
export type VariantKind = (typeof VARIANT_KINDS)[number];
export type InventoryMode = (typeof INVENTORY_MODES)[number];
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_NAME_LENGTH = 200;
const MAX_SHORT_DESCRIPTION_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 4000;
const MAX_SLUG_LENGTH = 120;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

/** Same normalization the ETL and the legacy site already use for ids. */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics (á -> a)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type ProductFormInput = {
  slug: string;
  name: string;
  brand: string | null;
  shortDescription: string | null;
  description: string | null;
  gender: string | null;
  concentration: string | null;
  salesMode: SalesMode;
  productionStatus: ProductionStatus;
  publicationStatus: PublicationStatus;
  isFeatured: boolean;
  featuredRank: number | null;
  featuredFrom: string | null;
  featuredUntil: string | null;
};

function nullableTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseDateOrNull(value: unknown, field: string, errors: FieldErrors): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    errors[field] = "Fecha inválida.";
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    errors[field] = "Fecha inválida.";
    return null;
  }
  return parsed.toISOString();
}

/**
 * Validates a full product create/edit submission. Full-replace by design —
 * the form always submits every field, so there is no partial-patch
 * ambiguity between "omitted" and "explicitly cleared".
 */
export function validateProductForm(input: {
  slug?: unknown;
  name?: unknown;
  brand?: unknown;
  shortDescription?: unknown;
  description?: unknown;
  gender?: unknown;
  concentration?: unknown;
  salesMode?: unknown;
  productionStatus?: unknown;
  publicationStatus?: unknown;
  isFeatured?: unknown;
  featuredRank?: unknown;
  featuredFrom?: unknown;
  featuredUntil?: unknown;
}): ValidationResult<ProductFormInput> {
  const errors: FieldErrors = {};

  const rawSlug = typeof input.slug === "string" ? input.slug.trim().toLowerCase() : "";
  if (!isNonEmptyString(rawSlug)) {
    errors.slug = "El slug es obligatorio.";
  } else if (rawSlug.length > MAX_SLUG_LENGTH) {
    errors.slug = `El slug no puede superar ${MAX_SLUG_LENGTH} caracteres.`;
  } else if (!SLUG_PATTERN.test(rawSlug)) {
    errors.slug = "El slug solo puede usar minúsculas, números y guiones (ej. mi-producto).";
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!isNonEmptyString(name)) {
    errors.name = "El nombre es obligatorio.";
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `El nombre no puede superar ${MAX_NAME_LENGTH} caracteres.`;
  }

  const shortDescription = nullableTrimmed(input.shortDescription);
  if (shortDescription && shortDescription.length > MAX_SHORT_DESCRIPTION_LENGTH) {
    errors.shortDescription = `La descripción corta no puede superar ${MAX_SHORT_DESCRIPTION_LENGTH} caracteres.`;
  }

  const description = nullableTrimmed(input.description);
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `La descripción no puede superar ${MAX_DESCRIPTION_LENGTH} caracteres.`;
  }

  const salesMode = isOneOf(input.salesMode, SALES_MODES) ? input.salesMode : null;
  if (!salesMode) errors.salesMode = "Selecciona un modo de venta válido.";

  const productionStatus = isOneOf(input.productionStatus, PRODUCTION_STATUSES)
    ? input.productionStatus
    : null;
  if (!productionStatus) errors.productionStatus = "Selecciona un estado de producción válido.";

  const publicationStatus = isOneOf(input.publicationStatus, PUBLICATION_STATUSES)
    ? input.publicationStatus
    : null;
  if (!publicationStatus) errors.publicationStatus = "Selecciona un estado de publicación válido.";

  const isFeatured = input.isFeatured === true;

  let featuredRank: number | null = null;
  if (isFeatured) {
    if (input.featuredRank === null || input.featuredRank === undefined || input.featuredRank === "") {
      featuredRank = null; // allowed: featured without a rank yet
    } else {
      const parsed = Number(input.featuredRank);
      if (!Number.isInteger(parsed) || parsed < 0) {
        errors.featuredRank = "El orden debe ser un número entero de 0 o más.";
      } else {
        featuredRank = parsed;
      }
    }
  } else if (
    input.featuredRank !== null &&
    input.featuredRank !== undefined &&
    input.featuredRank !== ""
  ) {
    // The DB check constraint (products_featured_rank_check) already forbids
    // this combination; catching it here gives a field-level message instead
    // of a raw constraint-violation error.
    errors.featuredRank = "El orden de destacado solo aplica si el producto está marcado como destacado.";
  }

  const featuredFrom = parseDateOrNull(input.featuredFrom, "featuredFrom", errors);
  const featuredUntil = parseDateOrNull(input.featuredUntil, "featuredUntil", errors);
  if (featuredFrom && featuredUntil && new Date(featuredUntil) <= new Date(featuredFrom)) {
    errors.featuredUntil = "La fecha de fin debe ser posterior a la fecha de inicio.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      slug: rawSlug,
      name,
      brand: nullableTrimmed(input.brand),
      shortDescription,
      description,
      gender: nullableTrimmed(input.gender),
      concentration: nullableTrimmed(input.concentration),
      salesMode: salesMode!,
      productionStatus: productionStatus!,
      publicationStatus: publicationStatus!,
      isFeatured,
      featuredRank,
      featuredFrom,
      featuredUntil,
    },
  };
}

export type VariantFormInput = {
  label: string;
  variantKind: VariantKind;
  sizeMl: number | null;
  priceAmount: number;
  currency: string;
  sku: string | null;
  publicationStatus: PublicationStatus;
  sortOrder: number;
};

const MAX_LABEL_LENGTH = 60;
const MAX_PRICE_AMOUNT = 100000;

/** Money is validated as a plain finite non-negative number here; the
 * database still stores/enforces it as numeric — this only rejects obviously
 * bad input (NaN, negative, float rounding past 2 decimals) before it reaches
 * SQL, never float arithmetic on the value itself. */
function parseMoney(value: unknown, field: string, errors: FieldErrors): number | null {
  // Number(null) and Number("") are both 0 — reject a missing price
  // explicitly instead of silently treating "not provided" as "free".
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
  if (parsed > MAX_PRICE_AMOUNT) {
    errors[field] = `El monto no puede superar ${MAX_PRICE_AMOUNT}.`;
    return null;
  }
  // Reject more than 2 decimal places rather than silently rounding a price.
  if (Math.round(parsed * 100) !== parsed * 100) {
    errors[field] = "El monto no puede tener más de 2 decimales.";
    return null;
  }
  return parsed;
}

export function validateVariantForm(input: {
  label?: unknown;
  variantKind?: unknown;
  sizeMl?: unknown;
  priceAmount?: unknown;
  currency?: unknown;
  sku?: unknown;
  publicationStatus?: unknown;
  sortOrder?: unknown;
}): ValidationResult<VariantFormInput> {
  const errors: FieldErrors = {};

  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (!isNonEmptyString(label)) {
    errors.label = "El nombre de la variante es obligatorio (ej. \"3 ml\").";
  } else if (label.length > MAX_LABEL_LENGTH) {
    errors.label = `El nombre de la variante no puede superar ${MAX_LABEL_LENGTH} caracteres.`;
  }

  const variantKind = isOneOf(input.variantKind, VARIANT_KINDS) ? input.variantKind : null;
  if (!variantKind) errors.variantKind = "Selecciona decant o frasco.";

  let sizeMl: number | null = null;
  if (input.sizeMl !== null && input.sizeMl !== undefined && input.sizeMl !== "") {
    const parsed = Number(input.sizeMl);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      errors.sizeMl = "El tamaño debe ser un número mayor que 0.";
    } else {
      sizeMl = parsed;
    }
  }

  const priceAmount = parseMoney(input.priceAmount, "priceAmount", errors);

  const currency = typeof input.currency === "string" && input.currency.trim().length === 3
    ? input.currency.trim().toUpperCase()
    : null;
  if (!currency) errors.currency = "La moneda debe ser un código de 3 letras (ej. PEN).";

  const sku = nullableTrimmed(input.sku);

  const publicationStatus = isOneOf(input.publicationStatus, PUBLICATION_STATUSES)
    ? input.publicationStatus
    : null;
  if (!publicationStatus) errors.publicationStatus = "Selecciona un estado de publicación válido.";

  const sortOrderParsed = input.sortOrder === undefined || input.sortOrder === "" ? 0 : Number(input.sortOrder);
  if (!Number.isInteger(sortOrderParsed)) {
    errors.sortOrder = "El orden debe ser un número entero.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      label,
      variantKind: variantKind!,
      sizeMl,
      priceAmount: priceAmount!,
      currency: currency!,
      sku,
      publicationStatus: publicationStatus!,
      sortOrder: sortOrderParsed,
    },
  };
}

export type InventoryFormInput = {
  inventoryMode: InventoryMode;
  availabilityStatus: AvailabilityStatus;
  quantityOnHand: number | null;
};

export function validateInventoryForm(input: {
  inventoryMode?: unknown;
  availabilityStatus?: unknown;
  quantityOnHand?: unknown;
}): ValidationResult<InventoryFormInput> {
  const errors: FieldErrors = {};

  const inventoryMode = isOneOf(input.inventoryMode, INVENTORY_MODES) ? input.inventoryMode : null;
  if (!inventoryMode) errors.inventoryMode = "Selecciona un modo de inventario válido.";

  const availabilityStatus = isOneOf(input.availabilityStatus, AVAILABILITY_STATUSES)
    ? input.availabilityStatus
    : null;
  if (!availabilityStatus) errors.availabilityStatus = "Selecciona una disponibilidad válida.";

  let quantityOnHand: number | null = null;
  if (inventoryMode === "tracked_quantity") {
    // Number(null) is 0 and Number("") is 0 — both would slip past
    // Number.isInteger and silently default a missing quantity to zero, so
    // "not provided" is rejected explicitly before the numeric check.
    if (
      input.quantityOnHand === null ||
      input.quantityOnHand === undefined ||
      input.quantityOnHand === ""
    ) {
      errors.quantityOnHand = "Ingresa una cantidad entera de 0 o más.";
    } else {
      const parsed = Number(input.quantityOnHand);
      if (!Number.isInteger(parsed) || parsed < 0) {
        errors.quantityOnHand = "Ingresa una cantidad entera de 0 o más.";
      } else {
        quantityOnHand = parsed;
      }
    }
  } else if (
    input.quantityOnHand !== null &&
    input.quantityOnHand !== undefined &&
    input.quantityOnHand !== ""
  ) {
    // Mirrors inventory_quantity_check: a status_only row cannot carry a
    // quantity. Caught here for a field-level message instead of a raw
    // 23514 check-violation from Postgres.
    errors.quantityOnHand = "La cantidad solo aplica en modo \"cantidad controlada\".";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: { inventoryMode: inventoryMode!, availabilityStatus: availabilityStatus!, quantityOnHand },
  };
}

/** UUID v4-ish route-param validation — good enough to reject an obviously
 * malformed id before it reaches a query, without pretending to validate a
 * specific UUID version the database itself does not require. */
export function isValidUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}
