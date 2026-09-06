import catalogFixtureJson from "../../fixtures/generated/legacy-catalog.json";
import {
  LegacyProductionMediaSource,
  type ProductMediaSource,
} from "./product-media-source";
import type {
  CatalogProduct,
  LegacyCatalogFixture,
  CatalogComboContent,
  LegacyProductRecord,
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
    imageUrl: media?.url ?? null,
    decantImageUrl: decantMedia?.url ?? null,
    bottleImageUrl: bottleMedia?.url ?? null,
    imageAlt: [product.brand, product.name].filter(Boolean).join(" "),
    verificationStatus: product.verificationStatus,
    bottlePricingVerificationStatus: product.bottlePricingVerificationStatus,
    comboCompositionVerificationStatus:
      product.comboCompositionVerificationStatus,
    comboContent,
  };
}

export class LegacyCatalogRepository {
  constructor(
    private readonly mediaSource: ProductMediaSource =
      new LegacyProductionMediaSource(),
  ) {}

  list(): CatalogProduct[] {
    return catalogFixture.products.map((product) =>
      toCatalogProduct(product, this.mediaSource),
    );
  }

  listFragrances(): CatalogProduct[] {
    return this.list().filter((product) => product.type !== "combo");
  }

  listCombos(): CatalogProduct[] {
    return this.list().filter((product) => product.type === "combo");
  }

  findByLegacyId(legacyId: string): CatalogProduct | null {
    const product = catalogFixture.products.find(
      (candidate) => candidate.legacy_id === legacyId,
    );
    return product ? toCatalogProduct(product, this.mediaSource) : null;
  }

  findBySlug(slug: string): CatalogProduct | null {
    const product = catalogFixture.products.find(
      (candidate) => candidate.id === slug,
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

  getBrandMedia() {
    return {
      logoUrl: this.mediaSource.resolve("img/logo-mark.png")?.url ?? null,
    };
  }
}
