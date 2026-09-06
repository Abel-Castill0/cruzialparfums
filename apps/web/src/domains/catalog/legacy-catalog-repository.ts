import catalogFixtureJson from "../../fixtures/generated/legacy-catalog.json";
import {
  LegacyProductionMediaSource,
  type ProductMediaSource,
} from "./product-media-source";
import type {
  CatalogProduct,
  LegacyCatalogFixture,
  LegacyProductRecord,
} from "./types";

const catalogFixture = catalogFixtureJson as unknown as LegacyCatalogFixture;

function toCatalogProduct(
  product: LegacyProductRecord,
  mediaSource: ProductMediaSource,
): CatalogProduct {
  const legacyImage = product.imgBottle ?? product.imgSet ?? product.img;
  const media = mediaSource.resolve(legacyImage);

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
    imageAlt: [product.brand, product.name].filter(Boolean).join(" "),
    verificationStatus: product.verificationStatus,
    bottlePricingVerificationStatus: product.bottlePricingVerificationStatus,
    comboCompositionVerificationStatus:
      product.comboCompositionVerificationStatus,
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

  findByLegacyId(legacyId: string): CatalogProduct | null {
    const product = catalogFixture.products.find(
      (candidate) => candidate.legacy_id === legacyId,
    );
    return product ? toCatalogProduct(product, this.mediaSource) : null;
  }

  getMetadata(): LegacyCatalogFixture["metadata"] {
    return catalogFixture.metadata;
  }

  getStorefrontConfig(): LegacyCatalogFixture["config"] {
    return catalogFixture.config;
  }
}
