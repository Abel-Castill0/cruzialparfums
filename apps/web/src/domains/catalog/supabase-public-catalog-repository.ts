import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type {
  CatalogGender,
  CatalogProduct,
  CatalogProductMedia,
  CatalogProductType,
  CatalogProductVariant,
  CatalogVerificationStatus,
  CatalogComboContent,
  CatalogComboPresentation,
  CatalogComboPresentationItem,
  ComboCompositionVerificationStatus,
  PublicCatalogRepository,
} from "./types";

export const PARFUMS_BUSINESS_UNIT_ID = "11111111-1111-4111-8111-111111111111";

type PublicCategory = {
  business_unit_id: string;
  kind: string;
  slug: string;
  name: string;
  publication_status: string;
  archived_at: string | null;
};

export type PublicProductRow = {
  id: string;
  business_unit_id: string;
  legacy_id: string | null;
  slug: string;
  brand: string | null;
  name: string;
  description: string | null;
  gender: string | null;
  concentration: string | null;
  production_status: string;
  availability_status: string;
  publication_status: string;
  archived_at: string | null;
  is_featured: boolean;
  featured_rank: number | null;
  featured_from: string | null;
  featured_until: string | null;
  verification_status: string;
  notes: Json;
  tag: string | null;
  product_variants: Array<{
    id: string;
    label: string;
    variant_kind: string;
    size_ml: number | string | null;
    price_amount: number | string;
    currency: string;
    publication_status: string;
    archived_at: string | null;
    sort_order: number;
    price_verification_status: string;
  }>;
  product_media: Array<{
    provider: string;
    secure_url: string;
    alt: string | null;
    is_primary: boolean;
    sort_order: number;
    archived_at: string | null;
    product_variant_id: string | null;
    media_role: string | null;
  }>;
  product_categories: Array<{
    sort_order: number;
    category: PublicCategory | PublicCategory[] | null;
  }>;
  combos: {
    composition_verification_status: string;
    combo_items: Array<{
      product_variant_id: string;
      combo_product_variant_id: string;
      quantity: number;
      sort_order: number;
      product_variants: {
        id: string;
        product_id: string;
        label: string;
        size_ml: number | string | null;
        products: {
          brand: string | null;
          name: string;
        };
      };
      combo_product_variants: {
        id: string;
        product_id: string;
        label: string;
        size_ml: number | string | null;
        products: {
          brand: string | null;
          name: string;
        };
      };
    }>;
  } | null;
};

const PUBLIC_PRODUCT_SELECT = `
  id, business_unit_id, legacy_id, slug, brand, name, description, gender,
  concentration, production_status, availability_status, publication_status,
  archived_at, is_featured, featured_rank, featured_from, featured_until,
  verification_status, notes:specs->notes, tag:specs->>tag,
  product_variants(id, label, variant_kind, size_ml, price_amount, currency,
    publication_status, archived_at, sort_order, price_verification_status),
  product_media(provider, secure_url, alt, is_primary, sort_order, archived_at,
    product_variant_id, media_role:metadata->>media_role),
  product_categories(sort_order, category:categories(business_unit_id, kind,
    slug, name, publication_status, archived_at)),
  combos:combos(composition_verification_status, combo_items(
    product_variant_id, combo_product_variant_id, quantity, sort_order,
    product_variants:product_variants!combo_items_product_variant_id_fkey(id, product_id, label, size_ml,
      products:products(brand, name)),
    combo_product_variants:product_variants!combo_items_combo_product_variant_id_fkey(id, product_id, label, size_ml,
      products:products(brand, name))))
`;

function asStringArray(value: Json | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function verification(value: string): CatalogVerificationStatus {
  return value === "client_confirmed" || value === "derived_validated"
    || value === "official_pdf" || value === "unknown" ? value : "legacy";
}

function gender(value: string | null): CatalogGender | null {
  return value === "women" || value === "men" || value === "unisex" ? value : null;
}

function productionStatus(value: string): "active" | "discontinued" | null {
  return value === "active" || value === "discontinued" ? value : null;
}

function availabilityStatus(value: string): "available" | "out_of_stock" | null {
  return value === "available" || value === "out_of_stock" ? value : null;
}

function categoryOf(row: PublicProductRow, kind: string): PublicCategory | null {
  for (const assignment of row.product_categories) {
    const category = Array.isArray(assignment.category)
      ? assignment.category[0] ?? null
      : assignment.category;
    if (category?.kind === kind
      && category.business_unit_id === PARFUMS_BUSINESS_UNIT_ID
      && category.publication_status === "published"
      && category.archived_at === null) return category;
  }
  return null;
}

function commercialType(category: PublicCategory | null): CatalogProductType | null {
  if (!category) return null;
  if (category.slug === "arab" || category.slug === "arabic") return "arab";
  if (category.slug === "designer" || category.slug === "niche") return category.slug;
  return null;
}

function comboVerificationStatus(value: string): ComboCompositionVerificationStatus {
  if (value === "official_pdf" || value === "pending_reconfirmation"
    || value === "client_confirmed" || value === "unknown") return value;
  return "unknown";
}

function decimal(value: number | string): string | null {
  const raw = typeof value === "number" ? value.toFixed(2) : value.trim();
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole = "0", fraction = ""] = raw.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

function size(value: number | string | null): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return String(value);
  if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) && Number(value) > 0) return value;
  return null;
}

function mapVariants(row: PublicProductRow): CatalogProductVariant[] {
  return row.product_variants
    .filter((item) => item.publication_status === "published" && item.archived_at === null)
    .flatMap<CatalogProductVariant>((item) => {
      const kind = item.variant_kind === "decant" || item.variant_kind === "bottle"
        ? item.variant_kind : null;
      const sizeMl = size(item.size_ml);
      const priceAmount = decimal(item.price_amount);
      if (!kind || !sizeMl || !priceAmount || item.currency !== "PEN") return [];
      return [{
        dbVariantId: item.id,
        variantId: `${kind}-${sizeMl}ml`,
        kind,
        sizeMl,
        label: item.label,
        priceAmount,
        currency: "PEN" as const,
        sortOrder: item.sort_order,
        priceVerificationStatus: verification(item.price_verification_status),
      }];
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.variantId.localeCompare(b.variantId));
}

type PublicMediaRole = "set" | "bottle" | "additional" | "hero";
type MappedPublicMedia = CatalogProductMedia & { role: PublicMediaRole | null };

function mediaRole(value: string | null): PublicMediaRole | null {
  return value === "set" || value === "bottle" || value === "additional" || value === "hero"
    ? value : null;
}

/**
 * Public media must be served over HTTPS (Cloudinary) or be a root-relative
 * path to a client asset this app hosts itself under /public (provider
 * `legacy_static`). Anything else — http://, protocol-relative, data: —
 * is dropped before it can reach an <img>.
 */
function publicMediaUrl(provider: string, secureUrl: string): boolean {
  if (/^https:\/\//.test(secureUrl)) return true;
  return provider === "legacy_static" && /^\/(?!\/)[^\s]+$/.test(secureUrl);
}

function mapMedia(row: PublicProductRow): MappedPublicMedia[] {
  const fallbackAlt = [row.brand, row.name].filter(Boolean).join(" ");
  const publicVariantIds = new Set(row.product_variants
    .filter((item) => item.publication_status === "published" && item.archived_at === null)
    .map((item) => item.id));
  return row.product_media
    .filter((item) => (item.provider === "cloudinary" || item.provider === "legacy_static")
      && item.archived_at === null
      && (item.product_variant_id === null || publicVariantIds.has(item.product_variant_id))
      && publicMediaUrl(item.provider, item.secure_url))
    .map((item) => ({
      url: item.secure_url,
      alt: item.alt?.trim() || fallbackAlt,
      isPrimary: item.is_primary,
      sortOrder: item.sort_order,
      role: mediaRole(item.media_role),
    }))
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)
      || a.sortOrder - b.sortOrder || a.url.localeCompare(b.url));
}

type ComboReadModel = {
  comboContent: CatalogComboContent | null;
  comboPresentations: CatalogComboPresentation[];
};

function buildComboContent(row: PublicProductRow, heroImageUrl: string | null): ComboReadModel {
  const comboItems = row.combos?.combo_items ?? [];
  if (comboItems.length === 0) return { comboContent: null, comboPresentations: [] };

  const perfumes: string[] = [];
  for (const item of comboItems) {
    const ingredient = item.product_variants?.products;
    if (!ingredient) return { comboContent: null, comboPresentations: [] };
    const name = [ingredient.brand, ingredient.name].filter(Boolean).join(" ");
    if (!name) return { comboContent: null, comboPresentations: [] };
    // combo_items repeat every ingredient once per presentation (3/5/10 ml);
    // the public composition lists each fragrance once, in item order.
    if (!perfumes.includes(name)) perfumes.push(name);
  }

  const firstItem = comboItems[0];
  const presentationVariant = firstItem?.combo_product_variants;
  const ml = presentationVariant?.size_ml != null
    ? Number(presentationVariant.size_ml)
    : 0;

  const comboContent: CatalogComboContent = {
    name: row.name,
    desc: row.description ?? "",
    perfumes,
    ml,
    heroImageUrl,
    verificationStatus: comboVerificationStatus(row.combos?.composition_verification_status ?? "unknown"),
  };

  // Build presentation-aware model grouped by combo_product_variant_id
  const presentationMap = new Map<string, CatalogComboPresentationItem[]>();
  for (const item of comboItems) {
    const pvId = item.combo_product_variant_id;
    if (!presentationMap.has(pvId)) presentationMap.set(pvId, []);
    const ingredient = item.product_variants;
    if (!ingredient?.products) continue;
    const ingredientSizeMl = size(ingredient.size_ml);
    if (!ingredientSizeMl) continue;
    presentationMap.get(pvId)!.push({
      ingredientProductId: ingredient.product_id,
      ingredientVariantId: ingredient.id,
      brand: ingredient.products.brand ?? "",
      name: ingredient.products.name,
      sizeMl: ingredientSizeMl,
      quantity: item.quantity,
      sortOrder: item.sort_order,
    });
  }

  // Find variant prices from the row's product_variants
  const variantPriceMap = new Map<string, { priceAmount: string; sizeMl: string }>();
  for (const pv of row.product_variants) {
    const pvSize = size(pv.size_ml);
    const pvPrice = decimal(pv.price_amount);
    if (pvSize && pvPrice) {
      variantPriceMap.set(pv.id, { priceAmount: pvPrice, sizeMl: pvSize });
    }
  }

  const comboPresentations: CatalogComboPresentation[] = [];
  for (const [pvId, items] of presentationMap) {
    const pvInfo = variantPriceMap.get(pvId);
    if (!pvInfo) continue;
    items.sort((a, b) => a.sortOrder - b.sortOrder);
    comboPresentations.push({
      comboVariantId: pvId,
      sizeMl: pvInfo.sizeMl,
      priceAmount: pvInfo.priceAmount,
      currency: "PEN",
      items,
    });
  }
  comboPresentations.sort((a, b) => Number(a.sizeMl) - Number(b.sizeMl));

  return { comboContent, comboPresentations };
}

/** Pure mapping seam used by local publication fixtures and the parity oracle. */
export function mapPublicProduct(row: PublicProductRow): CatalogProduct | null {
  if (row.business_unit_id !== PARFUMS_BUSINESS_UNIT_ID
    || row.publication_status !== "published" || row.archived_at !== null) return null;
  const type = commercialType(categoryOf(row, "commercial_type"));
  const family = categoryOf(row, "olfactory_family");
  const mappedGender = gender(row.gender);
  const production = productionStatus(row.production_status);
  const availability = availabilityStatus(row.availability_status);
  const isCombo = !!row.combos;
  if (!mappedGender || !production || !availability) return null;
  if (!isCombo && !type) return null;
  const variants = mapVariants(row);
  const decants = variants.filter((item) => item.kind === "decant");
  const bottles = variants.filter((item) => item.kind === "bottle");
  if (!isCombo && decants.length === 0) return null;
  const mappedMedia = mapMedia(row);
  // A wide promotional hero (combos) is never the product image itself.
  const heroMedia = mappedMedia.find((item) => item.role === "hero") ?? null;
  const productMedia = mappedMedia.filter((item) => item.role !== "hero");
  const primary = productMedia.find((item) => item.isPrimary) ?? productMedia[0] ?? null;
  const decantMedia = mappedMedia.find((item) => item.role === "set") ?? primary;
  const bottleMedia = mappedMedia.find((item) => item.role === "bottle") ?? primary;
  const media: CatalogProductMedia[] = productMedia.map((item) => ({
    url: item.url,
    alt: item.alt,
    isPrimary: item.isPrimary,
    sortOrder: item.sortOrder,
  }));
  const priceRecord = (items: CatalogProductVariant[]) => Object.fromEntries(
    items.map((item) => [item.sizeMl, Number(item.priceAmount)]),
  );

  const comboVerification = row.combos
    ? comboVerificationStatus(row.combos.composition_verification_status)
    : null;

  const { comboContent, comboPresentations } = isCombo
    ? buildComboContent(row, heroMedia?.url ?? null)
    : { comboContent: null, comboPresentations: [] };

  return {
    productId: row.id,
    legacyId: row.legacy_id,
    slug: row.slug,
    brand: row.brand ?? "",
    name: row.name,
    gender: mappedGender,
    type: isCombo ? "combo" : type!,
    family: family?.name ?? "",
    concentration: row.concentration ?? "",
    // Compatibility projection only. Exact source values remain in variants.priceAmount.
    decantPrices: priceRecord(decants),
    bottlePrices: bottles.length > 0 ? priceRecord(bottles) : null,
    notes: asStringArray(row.notes),
    tag: row.tag ?? family?.name ?? "",
    description: row.description ?? "",
    discontinued: production === "discontinued",
    bestseller: false,
    hidden: false,
    availabilityStatus: availability,
    isFeatured: row.is_featured,
    featuredRank: row.featured_rank,
    featuredFrom: row.featured_from,
    featuredUntil: row.featured_until,
    imageUrl: primary?.url ?? null,
    decantImageUrl: decantMedia?.url ?? null,
    bottleImageUrl: bottleMedia?.url ?? null,
    imageAlt: primary?.alt ?? [row.brand, row.name].filter(Boolean).join(" "),
    verificationStatus: verification(row.verification_status),
    bottlePricingVerificationStatus: bottles[0]?.priceVerificationStatus ?? null,
    comboCompositionVerificationStatus: comboVerification,
    comboContent,
    comboPresentations,
    variants,
    media,
  };
}

export class SupabasePublicCatalogRepository implements PublicCatalogRepository {
  private constructor(
    private readonly products: CatalogProduct[],
    private readonly combos: CatalogProduct[],
  ) {}

  /** One public/RLS-bound composed query. No secret client and no per-product reads. */
  static async load(supabase: SupabaseClient<Database>): Promise<SupabasePublicCatalogRepository> {
    const { data, error } = await supabase
      .from("products")
      .select(PUBLIC_PRODUCT_SELECT)
      .eq("business_unit_id", PARFUMS_BUSINESS_UNIT_ID)
      .eq("publication_status", "published")
      .is("archived_at", null)
      .order("name", { ascending: true });
    if (error) throw new Error(`Public catalog read failed: ${error.message}`);
    const all = ((data ?? []) as unknown as PublicProductRow[])
      .map(mapPublicProduct)
      .filter((product): product is CatalogProduct => product !== null);
    const combos = all.filter((product) => product.type === "combo");
    const products = all.filter((product) => product.type !== "combo");
    return new SupabasePublicCatalogRepository(products, combos);
  }

  static fromPublicRows(rows: PublicProductRow[]): SupabasePublicCatalogRepository {
    const all = rows
      .map(mapPublicProduct)
      .filter((item): item is CatalogProduct => item !== null);
    const combos = all.filter((product) => product.type === "combo");
    const products = all.filter((product) => product.type !== "combo");
    return new SupabasePublicCatalogRepository(products, combos);
  }

  /** Every public product including combos — the cart/checkout read model. */
  list() { return [...this.products, ...this.combos]; }
  listFragrances() { return [...this.products]; }
  listCombos() { return [...this.combos]; }
  listFeatured() {
    const now = Date.now();
    return this.products.filter((product) => {
      return product.isFeatured
        && (!product.featuredFrom || Date.parse(product.featuredFrom) <= now)
        && (!product.featuredUntil || Date.parse(product.featuredUntil) >= now);
    }).sort((a, b) => (a.featuredRank ?? Infinity) - (b.featuredRank ?? Infinity));
  }
  findByLegacyId(legacyId: string) {
    return [...this.products, ...this.combos].find((product) => product.legacyId === legacyId) ?? null;
  }
  findBySlug(slug: string) {
    return [...this.products, ...this.combos].find((product) => product.slug === slug) ?? null;
  }
  findByProductId(productId: string) {
    return [...this.products, ...this.combos].find((product) => product.productId === productId) ?? null;
  }
  resolveCartIdentity(identity: string) {
    return this.findByProductId(identity) ?? this.findByLegacyId(identity);
  }
  listRelated(product: CatalogProduct, limit = 4) {
    const candidates = this.products.filter((item) => item.legacyId !== product.legacyId);
    const related = candidates.filter((item) => item.gender === product.gender || item.family === product.family);
    return (related.length ? related : candidates).slice(0, limit);
  }
}
