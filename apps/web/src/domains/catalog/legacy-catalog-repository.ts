import catalogFixtureJson from "../../fixtures/generated/legacy-catalog.json";
import {
  LegacyProductionMediaSource,
  type ProductMediaSource,
} from "./product-media-source";
import type {
  CatalogProduct,
  CatalogWholesaleProduct,
  LegacyCatalogFixture,
  CatalogComboContent,
  LegacyProductRecord,
  PublicCatalogRepository,
} from "./types";

const catalogFixture = catalogFixtureJson as unknown as LegacyCatalogFixture;

function toCatalogProduct(
  product: LegacyProductRecord,
  mediaSource: ProductMediaSource,
): CatalogProduct {
  const legacyImage = product.imgBottle ?? product.imgSet ?? product.img;
  const media = mediaSource.resolve(legacyImage);
  const decantMedia = mediaSource.resolve(
    product.imgSet ?? product.imgBottle ?? product.img,
  );
  const bottleMedia = mediaSource.resolve(
    product.imgBottle ?? product.imgSet ?? product.img,
  );
  const legacyComboContent = catalogFixture.comboContents[product.legacy_id];
  const comboContent: CatalogComboContent | null = legacyComboContent ? {
    name: legacyComboContent.name,
    desc: legacyComboContent.desc,
    perfumes: [...legacyComboContent.perfumes],
    ml: legacyComboContent.ml,
    atomizaciones: legacyComboContent.atomizaciones,
    heroImageUrl: mediaSource.resolve(legacyComboContent.heroImage)?.url ?? null,
    heroCta: legacyComboContent.heroCta,
    verificationStatus: "client_provided_pending_reconfirmation",
  } : null;

  return {
    legacyId: product.legacy_id,
    slug: product.id,
    brand: product.brand,
    name: product.name,
    gender: product.gender,
    type: product.type,
    family: product.family,
    concentration: product.conc,
    decantPrices: product.price,
    bottlePrices: product.bottle,
    notes: product.notes,
    tag: product.tag,
    description: product.desc,
    discontinued: Boolean(product.discontinued),
    bestseller: Boolean(product.bestseller),
    hidden: Boolean(product.hidden),
    availabilityStatus: product.outOfStock ? "out_of_stock" : "available",
    isFeatured: Boolean(product.isFeatured),
    featuredRank: product.featuredRank ?? null,
    featuredFrom: product.featuredFrom ?? null,
    featuredUntil: product.featuredUntil ?? null,
    imageUrl: media?.url ?? null,
    decantImageUrl: decantMedia?.url ?? null,
    bottleImageUrl: bottleMedia?.url ?? null,
    imageAlt: [product.brand, product.name].filter(Boolean).join(" "),
    verificationStatus: product.verificationStatus,
    bottlePricingVerificationStatus: product.bottlePricingVerificationStatus,
    comboCompositionVerificationStatus:
      product.comboCompositionVerificationStatus,
    comboContent,
    variants: [
      ...Object.entries(product.price).map(([size, price], sortOrder) => ({
        variantId: `decant-${size}ml`,
        kind: "decant" as const,
        sizeMl: size,
        label: `${size} ml`,
        priceAmount: price.toFixed(2),
        currency: "PEN" as const,
        sortOrder,
        priceVerificationStatus: product.pricingVerificationStatus,
      })),
      ...Object.entries(product.bottle ?? {}).map(([size, price], index) => ({
        variantId: `bottle-${size}ml`,
        kind: "bottle" as const,
        sizeMl: size,
        label: `Frasco ${size} ml`,
        priceAmount: price.toFixed(2),
        currency: "PEN" as const,
        sortOrder: Object.keys(product.price).length + index,
        priceVerificationStatus:
          product.bottlePricingVerificationStatus ?? product.pricingVerificationStatus,
      })),
    ],
    media: media ? [{
      url: media.url,
      alt: [product.brand, product.name].filter(Boolean).join(" "),
      isPrimary: true,
      sortOrder: 0,
    }] : [],
  };
}

export class LegacyCatalogRepository implements PublicCatalogRepository {
  constructor(
    private readonly mediaSource: ProductMediaSource =
      new LegacyProductionMediaSource(),
  ) {}

  /**
   * Public surfaces only. `hidden` products (client-confirmed: not in
   * inventory, e.g. `bir-intense`) are excluded from catalog, Finder,
   * related, search, mayorista and any future sitemap — but the legacy
   * record is preserved (never deleted) for provenance. See
   * docs/client-decisions.md.
   */
  list(): CatalogProduct[] {
    return catalogFixture.products
      .filter((product) => !product.hidden)
      .map((product) => toCatalogProduct(product, this.mediaSource));
  }

  listFragrances(): CatalogProduct[] {
    return this.list().filter((product) => product.type !== "combo");
  }

  listCombos(): CatalogProduct[] {
    return this.list().filter((product) => product.type === "combo");
  }

  /**
   * FeaturedPerfumeRail source. Admin-curatable via `isFeatured`/
   * `featuredRank`/`featuredFrom`/`featuredUntil` — NOT a sales claim, NOT
   * a hardcoded eternal list. Returns [] whenever nothing is currently
   * marked featured (which is the case for the whole catalog today — no
   * client-confirmed curation exists yet, see assets/data.js). The rail
   * component must render nothing when this is empty, not a placeholder.
   */
  listFeatured(): CatalogProduct[] {
    const now = Date.now();
    return catalogFixture.products
      .filter((product) => {
        if (product.hidden || !product.isFeatured) return false;
        if (product.featuredFrom && new Date(product.featuredFrom).getTime() > now) return false;
        if (product.featuredUntil && new Date(product.featuredUntil).getTime() < now) return false;
        return true;
      })
      .map((product) => toCatalogProduct(product, this.mediaSource))
      .sort((a, b) => (a.featuredRank ?? Infinity) - (b.featuredRank ?? Infinity));
  }

  listWholesale(): CatalogWholesaleProduct[] {
    return this.listFragrances()
      .flatMap((product) => {
        const prices = catalogFixture.wholesale[product.legacyId];
        return prices ? [{ product, prices, verificationStatus: "legacy" as const }] : [];
      })
      .sort((a, b) =>
        a.product.brand.localeCompare(b.product.brand) ||
        a.product.name.localeCompare(b.product.name),
      );
  }

  findByLegacyId(legacyId: string): CatalogProduct | null {
    const product = catalogFixture.products.find(
      (candidate) => candidate.legacy_id === legacyId && !candidate.hidden,
    );
    return product ? toCatalogProduct(product, this.mediaSource) : null;
  }

  findBySlug(slug: string): CatalogProduct | null {
    const product = catalogFixture.products.find(
      (candidate) => candidate.id === slug && !candidate.hidden,
    );
    return product ? toCatalogProduct(product, this.mediaSource) : null;
  }

  listRelated(product: CatalogProduct, limit = 4): CatalogProduct[] {
    const candidates = this.listFragrances().filter(
      (candidate) => candidate.legacyId !== product.legacyId,
    );
    const related = candidates.filter(
      (candidate) =>
        candidate.gender === product.gender || candidate.family === product.family,
    );
    return (related.length > 0 ? related : candidates).slice(0, limit);
  }

  getMetadata(): LegacyCatalogFixture["metadata"] {
    return catalogFixture.metadata;
  }

  getStorefrontConfig(): LegacyCatalogFixture["config"] {
    return catalogFixture.config;
  }

  getHeroMedia() {
    return {
      // Client-provided homepage hero photo, unchanged since launch — see
      // AGENTS.md "Product photography". Not to be regenerated/reprocessed.
      heroUrl: this.mediaSource.resolve("img/hero/hero-crop.webp")?.url ?? null,
    };
  }

  getBrandMedia() {
    return {
      logoUrl: this.mediaSource.resolve("img/logo-mark.png")?.url ?? null,
    };
  }
}
