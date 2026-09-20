import { isValidUuid, type FieldErrors, type ValidationResult } from "./product-schema";

const CATEGORY_KINDS = ["commercial_type", "olfactory_family"] as const;
const ACTIVE_PUBLICATION_STATUSES = ["draft", "published"] as const;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INT32_MIN = -2_147_483_648;
const INT32_MAX = 2_147_483_647;

export type CategoryKind = (typeof CATEGORY_KINDS)[number];
export type CategoryPublicationStatus = (typeof ACTIVE_PUBLICATION_STATUSES)[number];

export type CategoryFormInput = {
  kind: CategoryKind;
  slug: string;
  name: string;
  description: string | null;
  parentId: string | null;
  publicationStatus: CategoryPublicationStatus;
  sortOrder: number;
};

function oneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && (options as readonly string[]).includes(value);
}

function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function validateCategoryForm(input: Record<string, unknown>): ValidationResult<CategoryFormInput> {
  const errors: FieldErrors = {};
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const slug = typeof input.slug === "string" ? input.slug.trim().toLowerCase() : "";
  const description = optionalText(input.description);
  const parentId = optionalText(input.parentId);
  const kind = oneOf(input.kind, CATEGORY_KINDS) ? input.kind : null;
  const publicationStatus = oneOf(input.publicationStatus, ACTIVE_PUBLICATION_STATUSES)
    ? input.publicationStatus
    : null;

  if (!name) errors.name = "El nombre es obligatorio.";
  else if (name.length > 200) errors.name = "El nombre no puede superar 200 caracteres.";

  if (!slug) errors.slug = "El slug es obligatorio.";
  else if (slug.length > 120) errors.slug = "El slug no puede superar 120 caracteres.";
  else if (!SLUG_PATTERN.test(slug)) {
    errors.slug = "El slug solo puede usar minúsculas, números y guiones.";
  }

  if (description && description.length > 4000) {
    errors.description = "La descripción no puede superar 4000 caracteres.";
  }
  if (!kind) errors.kind = "Selecciona un tipo válido para Parfums.";
  if (!publicationStatus) errors.publicationStatus = "Selecciona borrador o publicado.";
  if (parentId && !isValidUuid(parentId)) errors.parentId = "Selecciona una categoría padre válida.";

  const sortOrder = input.sortOrder === "" || input.sortOrder === undefined
    ? 0
    : Number(input.sortOrder);
  if (!Number.isSafeInteger(sortOrder) || sortOrder < INT32_MIN || sortOrder > INT32_MAX) {
    errors.sortOrder = "El orden debe ser un entero válido.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      kind: kind!,
      slug,
      name,
      description,
      parentId,
      publicationStatus: publicationStatus!,
      sortOrder,
    },
  };
}

export function isCategoryKind(value: unknown): value is CategoryKind {
  return oneOf(value, CATEGORY_KINDS);
}

export function isCategoryPublicationStatus(value: unknown): value is CategoryPublicationStatus {
  return oneOf(value, ACTIVE_PUBLICATION_STATUSES);
}

export function isValidExpectedTimestamp(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}
