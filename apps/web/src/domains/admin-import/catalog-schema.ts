export const IMPORT_PRODUCT_STATUSES = ["draft", "published", "hidden", "archived"] as const;
export type ImportProductStatus = (typeof IMPORT_PRODUCT_STATUSES)[number];
export const IMPORT_PRESENTATION_STATUSES = ["draft", "published", "archived"] as const;
export type ImportPresentationStatus = (typeof IMPORT_PRESENTATION_STATUSES)[number];
export const IMPORT_PRESENTATION_CLASSES = ["single_fixed", "multi_presentation", "pack_set", "ambiguous"] as const;
export type ImportPresentationClass = (typeof IMPORT_PRESENTATION_CLASSES)[number];

export const PRODUCT_STATUS_LABELS: Record<ImportProductStatus, string> = {
  draft: "Borrador", published: "Publicado", hidden: "Oculto", archived: "Archivado",
};
export const PRESENTATION_STATUS_LABELS: Record<ImportPresentationStatus, string> = {
  draft: "Borrador", published: "Publicada", archived: "Archivada",
};
export const PRESENTATION_CLASS_LABELS: Record<ImportPresentationClass, string> = {
  single_fixed: "Presentación única", multi_presentation: "Múltiple", pack_set: "Pack / set", ambiguous: "Ambigua",
};

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
function member<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export type ImportCatalogFilters = {
  query: string;
  publicationStatus?: ImportProductStatus;
  categorySlug?: string;
  archived: "active" | "archived" | "all";
  presentationState?: "with_active" | "without_active" | "without_published";
  offerState?: "with_offer" | "without_offer";
  page: number;
  pageSize: number;
};

export function parseImportCatalogFilters(params: Record<string, string | string[] | undefined>): ImportCatalogFilters {
  const rawPage = Number(one(params.page) ?? 1);
  const rawSize = Number(one(params.pageSize) ?? 40);
  const status = one(params.status);
  const archived = one(params.archived);
  const presentation = one(params.presentation);
  const offer = one(params.offer);
  return {
    query: (one(params.q) ?? "").trim().slice(0, 120),
    ...(member(IMPORT_PRODUCT_STATUSES, status) ? { publicationStatus: status } : {}),
    ...(one(params.category) ? { categorySlug: one(params.category)!.slice(0, 80) } : {}),
    archived: archived === "archived" || archived === "all" ? archived : "active",
    ...(presentation === "with_active" || presentation === "without_active" || presentation === "without_published" ? { presentationState: presentation } : {}),
    ...(offer === "with_offer" || offer === "without_offer" ? { offerState: offer } : {}),
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
    pageSize: Number.isInteger(rawSize) ? Math.min(50, Math.max(1, rawSize)) : 40,
  };
}

export type ProductReadinessInput = {
  productStatus: ImportProductStatus;
  archived: boolean;
  activePresentations: number;
  publishedPresentations: number;
  offerCount: number;
  unconfirmedOfferCount: number;
  campaignStatus: string | null;
};

export type ProductReadiness = {
  structural: "blocked" | "structured" | "published";
  commercial: "blocked" | "pending" | "configured";
  publicVisibility: "not_public" | "eligible";
  blockers: string[];
};

export function classifyProductReadiness(input: ProductReadinessInput): ProductReadiness {
  const blockers: string[] = [];
  if (input.archived || input.productStatus === "archived") blockers.push("Producto archivado");
  else if (input.productStatus === "draft") blockers.push("Producto en borrador");
  else if (input.productStatus === "hidden") blockers.push("Producto oculto");
  if (input.activePresentations === 0) blockers.push("Sin presentación activa");
  else if (input.publishedPresentations === 0) blockers.push("Sin presentación publicada");
  if (input.offerCount === 0) blockers.push("Sin oferta en #6");
  else if (input.unconfirmedOfferCount > 0) blockers.push("Disponibilidad por confirmar");
  if (input.campaignStatus !== "open") blockers.push("Consolidado no abierto");
  const structural = input.archived || input.activePresentations === 0 ? "blocked"
    : input.productStatus === "published" && input.publishedPresentations > 0 ? "published" : "structured";
  const commercial = input.offerCount === 0 ? "blocked" : input.unconfirmedOfferCount > 0 ? "pending" : "configured";
  return { structural, commercial, publicVisibility: blockers.length === 0 ? "eligible" : "not_public", blockers };
}

export function validateImportProductInput(raw: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const brand = typeof raw.brand === "string" ? raw.brand.trim() : "";
  const categoryId = typeof raw.categoryId === "string" ? raw.categoryId : "";
  const publicationStatus = raw.publicationStatus;
  if (!name || name.length > 180) errors.name = "Ingresa un nombre de hasta 180 caracteres.";
  if (brand.length > 120) errors.brand = "La marca admite hasta 120 caracteres.";
  if (!/^[0-9a-f-]{36}$/i.test(categoryId)) errors.categoryId = "Selecciona una categoría Import válida.";
  if (!member(IMPORT_PRODUCT_STATUSES, publicationStatus) || publicationStatus === "archived") errors.publicationStatus = "Selecciona borrador, publicado u oculto.";
  return Object.keys(errors).length ? { ok: false as const, errors } : { ok: true as const, value: { name, brand: brand || null, categoryId, publicationStatus: publicationStatus as Exclude<ImportProductStatus,"archived"> } };
}

export function validatePresentationInput(raw: Record<string, unknown>, updating: boolean) {
  const errors: Record<string, string> = {};
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  const presentationClass = raw.presentationClass;
  const status = updating ? raw.publicationStatus : "draft";
  const capText = typeof raw.capacityMl === "string" ? raw.capacityMl.trim() : "";
  const capacityMl = capText === "" ? null : Number(capText);
  if (!label || label.length > 180) errors.label = "Ingresa una etiqueta de hasta 180 caracteres.";
  if (!member(IMPORT_PRESENTATION_CLASSES, presentationClass)) errors.presentationClass = "Selecciona una clase válida.";
  if (updating && (!member(IMPORT_PRESENTATION_STATUSES, status) || status === "archived")) errors.publicationStatus = "Selecciona borrador o publicada.";
  if (capacityMl !== null && (!Number.isFinite(capacityMl) || capacityMl <= 0 || capacityMl > 999999.99)) errors.capacityMl = "La capacidad debe ser un número positivo.";
  return Object.keys(errors).length ? { ok: false as const, errors } : { ok: true as const, value: { label, presentationClass: presentationClass as ImportPresentationClass, capacityMl, publicationStatus: status as "draft"|"published" } };
}
