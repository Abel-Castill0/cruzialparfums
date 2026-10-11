import type { Json } from "@/lib/supabase/database.types";

export const IMPORT_CATALOG_PAGE_SIZE = 24;
export const IMPORT_CATALOG_MAX_PAGE = 100;
export const IMPORT_FALLBACK_MEDIA = "/import/catalog-fallback.png";

export type PublicImportAvailability = "available" | "out_of_stock";
export type PublicImportPresentationClass =
  | "single_fixed"
  | "multi_presentation"
  | "pack_set"
  | "ambiguous";

export type PublicImportCampaign = {
  id: string;
  number: number;
  name: string;
  opensAt: string | null;
  closesAt: string | null;
  publicMessage: string | null;
};

export type PublicImportPresentation = {
  id: string;
  offerId: string;
  offerUpdatedAt: string;
  label: string;
  presentationClass: PublicImportPresentationClass;
  capacityMl: number | null;
  price: string;
  currency: string;
  availability: PublicImportAvailability;
};

export type PublicImportProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  mediaUrl: string;
  mediaAlt: string;
  hasApprovedMedia: boolean;
  presentations: PublicImportPresentation[];
};

/** Read-only preview data for a future scheduled campaign. It deliberately
 * has no offer ids, version token, or availability that could enter a cart. */
export type PublicImportPreviewProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  mediaUrl: string;
  mediaAlt: string;
  hasApprovedMedia: boolean;
  presentations: Array<{
    id: string;
    label: string;
    presentationClass: PublicImportPresentationClass;
    capacityMl: number | null;
    price: string;
    currency: string;
  }>;
};

export type PublicImportWholesaleRule = {
  commercialType: "arabic" | "designer" | "niche";
  minQuantity: number;
  discountAmount: string;
  currency: string;
};

export type PublicImportCategory = {
  slug: string;
  name: string;
  productCount: number;
};

export type PublicImportFilters = {
  query: string;
  category: string;
  page: number;
};

export type PublicImportCampaignRow = {
  id: string;
  number: number;
  name: string;
  opens_at: string | null;
  closes_at: string | null;
  public_message: string | null;
};

export function selectPublicImportCampaign(
  rows: PublicImportCampaignRow[],
): PublicImportCampaign | null {
  if (rows.length !== 1) return null;
  const row = rows[0]!;
  if (
    typeof row.id !== "string" ||
    row.id.trim() === "" ||
    !Number.isInteger(row.number) ||
    row.number <= 0 ||
    !row.name.trim()
  )
    return null;
  return {
    id: row.id,
    number: row.number,
    name: row.name,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    publicMessage: row.public_message,
  };
}

export function parsePublicImportFilters(
  params: Record<string, string | string[] | undefined>,
): PublicImportFilters {
  const first = (value: string | string[] | undefined) =>
    typeof value === "string" ? value : "";
  const parsedPage = Number(first(params.page));
  return {
    query: first(params.q).trim().slice(0, 120),
    category: first(params.categoria).trim().slice(0, 80),
    page:
      Number.isInteger(parsedPage) && parsedPage > 0
        ? Math.min(parsedPage, IMPORT_CATALOG_MAX_PAGE)
        : 1,
  };
}

function isRecord(value: Json | undefined): value is Record<string, Json | undefined> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const PRESENTATION_CLASSES = new Set<PublicImportPresentationClass>([
  "single_fixed",
  "multi_presentation",
  "pack_set",
  "ambiguous",
]);

export function mapPublicImportPresentations(value: Json): PublicImportPresentation[] {
  if (!Array.isArray(value)) return [];
  const result: PublicImportPresentation[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const presentationClass = item.class;
    const availability = item.availability;
    if (
      typeof item.id !== "string" ||
      typeof item.offerId !== "string" ||
      typeof item.offerUpdatedAt !== "string" ||
      typeof item.label !== "string" ||
      typeof presentationClass !== "string" ||
      !PRESENTATION_CLASSES.has(presentationClass as PublicImportPresentationClass) ||
      typeof item.price !== "string" ||
      typeof item.currency !== "string" ||
      (availability !== "available" && availability !== "out_of_stock")
    ) {
      continue;
    }
    const capacity = item.capacityMl;
    result.push({
      id: item.id,
      offerId: item.offerId,
      offerUpdatedAt: item.offerUpdatedAt,
      label: item.label,
      presentationClass: presentationClass as PublicImportPresentationClass,
      capacityMl: typeof capacity === "number" ? capacity : null,
      price: item.price,
      currency: item.currency,
      availability,
    });
  }
  return result;
}

type ProductRpcRow = {
  product_id: string;
  slug: string;
  name: string;
  brand: string | null;
  category_slug: string | null;
  category_name: string | null;
  media_url: string | null;
  media_alt: string | null;
  presentations: Json;
};

type PreviewProductRpcRow = Omit<ProductRpcRow, "presentations"> & { presentations: Json };

export function mapPublicImportProduct(row: ProductRpcRow): PublicImportProduct | null {
  const presentations = mapPublicImportPresentations(row.presentations);
  if (!row.product_id || !row.slug || !row.name || presentations.length === 0) return null;
  const hasApprovedMedia = Boolean(row.media_url);
  return {
    id: row.product_id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    categorySlug: row.category_slug,
    categoryName: row.category_name,
    mediaUrl: row.media_url || IMPORT_FALLBACK_MEDIA,
    mediaAlt: row.media_url
      ? row.media_alt?.trim() || `${row.brand ? `${row.brand} ` : ""}${row.name}`
      : "Composición gráfica de Cruzial Import",
    hasApprovedMedia,
    presentations,
  };
}

export function mapPublicImportProducts(rows: ProductRpcRow[]): PublicImportProduct[] {
  return rows
    .map(mapPublicImportProduct)
    .filter((product): product is PublicImportProduct => product !== null);
}

export function mapPublicImportPreviewProduct(row: PreviewProductRpcRow): PublicImportPreviewProduct | null {
  if (!row.product_id || !row.slug || !row.name || !Array.isArray(row.presentations)) return null;
  const presentations = row.presentations.flatMap((value) => {
    if (!isRecord(value)) return [];
    const presentationClass = value.class;
    if (
      typeof value.id !== "string" || typeof value.label !== "string" ||
      typeof presentationClass !== "string" || !PRESENTATION_CLASSES.has(presentationClass as PublicImportPresentationClass) ||
      typeof value.price !== "string" || typeof value.currency !== "string"
    ) return [];
    return [{
      id: value.id,
      label: value.label,
      presentationClass: presentationClass as PublicImportPresentationClass,
      capacityMl: typeof value.capacityMl === "number" ? value.capacityMl : null,
      price: value.price,
      currency: value.currency,
    }];
  });
  if (presentations.length === 0) return null;
  const hasApprovedMedia = Boolean(row.media_url);
  return {
    id: row.product_id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    categorySlug: row.category_slug,
    categoryName: row.category_name,
    mediaUrl: row.media_url || IMPORT_FALLBACK_MEDIA,
    mediaAlt: row.media_url ? row.media_alt?.trim() || `${row.brand ? `${row.brand} ` : ""}${row.name}` : "Imagen del producto pendiente",
    hasApprovedMedia,
    presentations,
  };
}

export function availabilityLabel(value: PublicImportAvailability): string {
  return value === "out_of_stock" ? "Agotado" : "Disponible";
}

export function presentationClassLabel(value: PublicImportPresentationClass): string {
  const labels: Record<PublicImportPresentationClass, string> = {
    single_fixed: "Presentación única",
    multi_presentation: "Presentación",
    pack_set: "Pack o set",
    ambiguous: "Presentación indicada",
  };
  return labels[value];
}

export function formatCampaignPrice(price: string, currency: string): string {
  const amount = Number(price);
  if (!Number.isFinite(amount)) return price;
  if (currency === "PEN") {
    return new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: "PEN",
      minimumFractionDigits: 2,
    }).format(amount);
  }
  return `${currency} ${amount.toFixed(2)}`;
}

export function buildImportCatalogHref(
  filters: PublicImportFilters,
  changes: Partial<PublicImportFilters>,
): string {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (next.query) params.set("q", next.query);
  if (next.category) params.set("categoria", next.category);
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `/import?${query}` : "/import";
}

export type ImportGalleryPhoto = { url: string; alt: string };
export type ImportMediaRow = { secure_url: string | null; alt: string | null; provider?: string | null };

/** Same rule as the Parfums public mapper: HTTPS, or a root-relative path to an asset this app hosts
 * (provider `legacy_static`). http://, protocol-relative and data: URLs never reach an <img>. */
function publicPhotoUrl(row: ImportMediaRow, url: string): boolean {
  if (/^https:\/\//.test(url)) return true;
  return row.provider === "legacy_static" && /^\/(?!\/)[^\s]+$/.test(url);
}

/**
 * Every public photo of an Import product, primary first, in the order the admin arranged them
 * (rows arrive already ordered by is_primary desc, sort_order, id; public RLS keeps only non-archived
 * photos of published products). Duplicates are dropped. With no usable row — or when the photo read
 * failed and the caller passes null — the product's single resolved photo (or the neutral fallback)
 * is kept, so the page never renders an empty stage.
 */
export function importGalleryPhotos(rows: ImportMediaRow[] | null, product: Pick<PublicImportProduct, "brand" | "name" | "mediaUrl" | "mediaAlt">): ImportGalleryPhoto[] {
  const base = [product.brand, product.name].filter(Boolean).join(" ");
  const seen = new Set<string>();
  const photos: ImportGalleryPhoto[] = [];
  for (const row of rows ?? []) {
    const url = row.secure_url?.trim();
    if (!url || seen.has(url) || !publicPhotoUrl(row, url)) continue;
    seen.add(url);
    photos.push({ url, alt: row.alt?.trim() || base });
  }
  return photos.length ? photos : [{ url: product.mediaUrl, alt: product.mediaAlt }];
}

/**
 * Public label for a scheduled consolidado's estimated opening. A date that has
 * already passed while the campaign is still not open is no longer an estimate
 * the customer can rely on, so it reads "por confirmar" instead of a past date.
 */
export function estimatedOpeningLabel(opensAt: string | null, now: Date = new Date()): string {
  if (!opensAt) return "por confirmar";
  const at = new Date(opensAt);
  if (Number.isNaN(at.getTime()) || at.getTime() <= now.getTime()) return "por confirmar";
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "long", timeZone: "America/Lima" }).format(at);
}
