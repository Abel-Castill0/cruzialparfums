import type { Database, Json } from "@/lib/supabase/database.types";
import { mapPublicProduct, type PublicProductRow } from "@/domains/catalog/supabase-public-catalog-repository";

// Presentation-only interpretation of a Parfums product for the owner.
//
// Storefront visibility is NOT re-implemented here: the verdict comes from
// running the admin data through mapPublicProduct(), the exact pure mapping
// the public catalog uses to decide whether a published row becomes a
// storefront product. The individual checks below only EXPLAIN that verdict
// in plain language; if the storefront rejects a product for a reason none of
// them recognizes, the UI says so instead of guessing.

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type VariantRow = Database["public"]["Tables"]["product_variants"]["Row"];
type InventoryRow = Database["public"]["Tables"]["inventory"]["Row"];
type MediaRow = Database["public"]["Tables"]["product_media"]["Row"];
type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
type ProductCategoryRow = Database["public"]["Tables"]["product_categories"]["Row"];

export type ParfumsProductDetailInput = {
  product: ProductRow;
  variants: (VariantRow & { inventory: InventoryRow | null })[];
  categories: (ProductCategoryRow & { category: CategoryRow | null })[];
  media: MediaRow[];
};

function jsonObject(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/** Admin rows → the storefront's PublicProductRow shape (combos excluded). */
export function toPublicProductRow(input: ParfumsProductDetailInput): PublicProductRow {
  const { product } = input;
  const specs = jsonObject(product.specs);
  return {
    id: product.id,
    business_unit_id: product.business_unit_id,
    legacy_id: product.legacy_id,
    slug: product.slug,
    brand: product.brand,
    name: product.name,
    description: product.description,
    gender: product.gender,
    concentration: product.concentration,
    production_status: product.production_status,
    availability_status: product.availability_status,
    publication_status: product.publication_status,
    archived_at: product.archived_at,
    is_featured: product.is_featured,
    featured_rank: product.featured_rank,
    featured_from: product.featured_from,
    featured_until: product.featured_until,
    verification_status: product.verification_status,
    notes: (specs.notes ?? null) as Json,
    tag: typeof specs.tag === "string" ? specs.tag : null,
    product_variants: input.variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      variant_kind: variant.variant_kind,
      size_ml: variant.size_ml,
      price_amount: variant.price_amount,
      currency: variant.currency,
      publication_status: variant.publication_status,
      archived_at: variant.archived_at,
      sort_order: variant.sort_order,
      price_verification_status: variant.price_verification_status,
      // Purchase availability only; it never decides storefront visibility.
      is_available: null,
    })),
    product_media: input.media.map((item) => {
      const role = jsonObject(item.metadata).media_role;
      return {
        provider: item.provider,
        secure_url: item.secure_url,
        alt: item.alt,
        is_primary: item.is_primary,
        sort_order: item.sort_order,
        archived_at: item.archived_at,
        product_variant_id: item.product_variant_id,
        media_role: typeof role === "string" ? role : null,
      };
    }),
    product_categories: input.categories.map((assignment) => ({
      sort_order: assignment.sort_order,
      category: assignment.category
        ? {
            business_unit_id: assignment.category.business_unit_id,
            kind: assignment.category.kind,
            slug: assignment.category.slug,
            name: assignment.category.name,
            publication_status: assignment.category.publication_status,
            archived_at: assignment.category.archived_at,
          }
        : null,
    })),
    combos: null,
  };
}

export type ReadinessState = "complete" | "attention" | "not_started" | "blocked" | "unknown";

export type ProductCheck = {
  key: "info" | "type" | "variants" | "prices" | "media" | "publication" | "availability";
  title: string;
  state: ReadinessState;
  /** true = the storefront requires it; false = advisory only. */
  blocking: boolean;
  detail: string;
  anchor: string;
  actionLabel: string;
};

export type ParfumsProductAssessment = {
  /** Verdict from the storefront's own mapper. */
  visibleInStore: boolean;
  purchasable: boolean;
  headline: string;
  consequence: string;
  checks: ProductCheck[];
  /** First failing blocking check, else first advisory; null when none. */
  nextCheck: ProductCheck | null;
  /** Storefront rejected it but no known check explains why. */
  unexplained: boolean;
};

const PUBLIC_COMMERCIAL_TYPES = new Set(["arab", "arabic", "designer", "niche"]);

function n(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export function assessParfumsProduct(input: ParfumsProductDetailInput): ParfumsProductAssessment {
  const { product } = input;
  const publicRow = toPublicProductRow(input);
  const mapped = mapPublicProduct(publicRow);
  const visibleInStore = mapped !== null;

  const activeVariants = input.variants.filter((variant) => variant.archived_at === null);
  const publishedVariants = activeVariants.filter((variant) => variant.publication_status === "published");
  const sellableDecants = publishedVariants.filter(
    (variant) =>
      variant.variant_kind === "decant" &&
      variant.size_ml !== null &&
      variant.size_ml > 0 &&
      variant.currency === "PEN" &&
      Number.isFinite(variant.price_amount) &&
      variant.price_amount >= 0,
  );
  const referencePrices = publishedVariants.filter((variant) => variant.price_verification_status === "provisional_market" || variant.price_verification_status === "owner_selected_provisional");
  const zeroPrices = publishedVariants.filter((variant) => variant.price_amount <= 0);
  const liveCategories = input.categories
    .map((assignment) => assignment.category)
    .filter((category): category is CategoryRow => category !== null && category.archived_at === null && category.publication_status === "published");
  const hasCommercialType = liveCategories.some(
    (category) => category.kind === "commercial_type" && PUBLIC_COMMERCIAL_TYPES.has(category.slug),
  );
  const activeMedia = input.media.filter((item) => item.archived_at === null);
  const hasPrimary = activeMedia.some((item) => item.is_primary);
  const genderOk = product.gender === "women" || product.gender === "men" || product.gender === "unisex";
  const archived = product.archived_at !== null;
  const published = product.publication_status === "published" && !archived;
  const outOfStock = product.availability_status === "out_of_stock";

  const checks: ProductCheck[] = [
    {
      key: "info",
      title: "Información del producto",
      state: genderOk ? "complete" : "attention",
      blocking: true,
      detail: genderOk ? "Datos básicos completos para la tienda." : "Elige el género (Mujer, Hombre o Unisex). Sin un género reconocido, la tienda no lo muestra.",
      anchor: "#informacion",
      actionLabel: "Completar información",
    },
    {
      key: "type",
      title: "Tipo comercial",
      state: hasCommercialType ? "complete" : "attention",
      blocking: true,
      detail: hasCommercialType
        ? "Tiene un tipo comercial publicado (árabe, diseñador o nicho)."
        : "Asigna un tipo comercial publicado (árabe, diseñador o nicho). Sin él, la tienda no lo muestra.",
      anchor: "#categorias",
      actionLabel: "Elegir categoría",
    },
    {
      key: "variants",
      title: "Presentaciones y precios",
      state: sellableDecants.length > 0 ? "complete" : activeVariants.length === 0 ? "not_started" : "attention",
      blocking: true,
      detail:
        sellableDecants.length > 0
          ? `${n(sellableDecants.length, "decant publicado", "decants publicados")} con tamaño y precio en soles.`
          : activeVariants.length === 0
            ? "Todavía no tiene presentaciones. Agrega al menos un decant con tamaño y precio."
            : "Ningún decant está publicado con tamaño y precio en soles. La tienda necesita al menos uno.",
      anchor: "#presentaciones",
      actionLabel: activeVariants.length === 0 ? "Agregar presentación" : "Revisar presentaciones",
    },
    {
      key: "prices",
      title: "Precios confirmados",
      state: referencePrices.length === 0 && zeroPrices.length === 0 ? "complete" : "attention",
      blocking: false,
      detail:
        zeroPrices.length > 0
          ? `${n(zeroPrices.length, "presentación publicada tiene", "presentaciones publicadas tienen")} precio 0. Revisa el precio antes de vender.`
          : referencePrices.length === 0
            ? "No hay precios marcados como referencia de mercado."
            : `${n(referencePrices.length, "presentación publicada usa", "presentaciones publicadas usan")} un precio referencial sin confirmar.`,
      anchor: "#presentaciones",
      actionLabel: "Revisar precios",
    },
    {
      key: "media",
      title: "Fotos",
      state: hasPrimary ? "complete" : activeMedia.length === 0 ? "not_started" : "attention",
      blocking: false,
      detail: hasPrimary
        ? `${n(activeMedia.length, "foto", "fotos")}, con foto principal.`
        : activeMedia.length === 0
          ? "Sin fotos. La tienda mostrará el producto sin imagen propia."
          : "Hay fotos, pero ninguna está marcada como principal.",
      anchor: "#fotos",
      actionLabel: activeMedia.length === 0 ? "Subir fotos" : "Elegir foto principal",
    },
    {
      key: "publication",
      title: "Publicación",
      state: published ? "complete" : "attention",
      blocking: true,
      detail: archived
        ? "Archivado: no aparece en la tienda."
        : published
          ? "Publicado."
          : "En borrador: los clientes todavía no pueden verlo.",
      anchor: "#informacion",
      actionLabel: archived ? "Ver estado" : "Cambiar publicación",
    },
    {
      key: "availability",
      title: "Disponibilidad",
      state: outOfStock ? "attention" : "complete",
      blocking: false,
      detail: outOfStock
        ? "Marcado como agotado: puede verse en la tienda, pero no se puede comprar."
        : "Disponible para compra.",
      anchor: "#informacion",
      actionLabel: "Revisar disponibilidad",
    },
  ];

  const failingBlocking = checks.filter((check) => check.blocking && check.state !== "complete");
  const failingAdvisory = checks.filter((check) => !check.blocking && check.state !== "complete");
  const unexplained = !visibleInStore && failingBlocking.length === 0;

  let headline: string;
  let consequence: string;
  if (archived) {
    headline = "Archivado";
    consequence = "Este producto no aparece en la tienda y queda como historial.";
  } else if (visibleInStore && !outOfStock) {
    headline = "Visible en la tienda";
    consequence = "Este producto puede aparecer en la tienda y los clientes pueden pedirlo.";
  } else if (visibleInStore && outOfStock) {
    headline = "Visible, pero agotado";
    consequence = "Aparece en la tienda, pero no está disponible para compra.";
  } else if (!published) {
    headline = "No visible en la tienda";
    consequence = "Los clientes todavía no pueden verlo.";
  } else {
    headline = "Publicado, pero no visible";
    consequence = unexplained
      ? "La tienda no lo muestra por una condición que no pudimos identificar. Revisa sus datos con soporte."
      : "Está publicado, pero a la tienda le falta información para mostrarlo.";
  }

  return {
    visibleInStore,
    purchasable: visibleInStore && !outOfStock,
    headline,
    consequence,
    checks,
    nextCheck: failingBlocking[0] ?? failingAdvisory[0] ?? null,
    unexplained,
  };
}

// ---------------------------------------------------------------------------
// List views — owner vocabulary over existing URL filters only.
// ---------------------------------------------------------------------------

export type ParfumsListView = {
  key: string;
  label: string;
  params: { publication?: string; availability?: string; archived?: string };
};

export const PARFUMS_LIST_VIEWS: readonly ParfumsListView[] = [
  { key: "all", label: "Todos", params: {} },
  { key: "published", label: "Publicados", params: { publication: "published" } },
  { key: "draft", label: "Borradores", params: { publication: "draft" } },
  { key: "out_of_stock", label: "Agotados", params: { availability: "out_of_stock" } },
  { key: "archived", label: "Archivados", params: { publication: "archived", archived: "1" } },
];

const VIEW_KEYS = ["publication", "availability", "archived"] as const;

export function currentParfumsView(params: Record<string, string>): string | null {
  const view = PARFUMS_LIST_VIEWS.find((candidate) =>
    VIEW_KEYS.every((key) => (candidate.params[key] ?? "") === (params[key] ?? "")),
  );
  return view?.key ?? null;
}

/** Keeps search/production/featured, swaps the view params, drops page. */
export function parfumsViewHref(basePath: string, params: Record<string, string>, view: ParfumsListView): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page" || (VIEW_KEYS as readonly string[]).includes(key) || !value) continue;
    next.set(key, value);
  }
  for (const [key, value] of Object.entries(view.params)) if (value) next.set(key, value);
  const query = next.toString();
  return query ? `${basePath}?${query}` : basePath;
}
