import { describe, expect, it } from "vitest";
import {
  mapPublicProduct,
  PARFUMS_BUSINESS_UNIT_ID,
  SupabasePublicCatalogRepository,
  type PublicProductRow,
} from "./supabase-public-catalog-repository";
import type { CatalogProduct, CatalogProductVariant } from "./types";
import {
  classifyVariantReadiness,
  classifyProductReadiness,
  filterStorefrontReady,
  classifyPrePublicationReadiness,
} from "./readiness";
import { LegacyCatalogRepository } from "./legacy-catalog-repository";
import { listProductPurchaseVariants } from "./product-purchase";
import { validateAndResolveParfumsOrder } from "../orders/parfums-order-request";
import { mapPublicContact } from "./public-contact-repository";

/* ------------------------------------------------------------------ */
/*  Row factory                                                        */
/* ------------------------------------------------------------------ */

function row(overrides: Partial<PublicProductRow> = {}): PublicProductRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    business_unit_id: PARFUMS_BUSINESS_UNIT_ID,
    legacy_id: "test-parfum",
    slug: "test-parfum",
    brand: "Maison Test",
    name: "Test Parfum",
    description: "Descripción",
    gender: "unisex",
    concentration: "EDP",
    production_status: "active",
    availability_status: "available",
    publication_status: "published",
    archived_at: null,
    is_featured: false,
    featured_rank: null,
    featured_from: null,
    featured_until: null,
    verification_status: "legacy",
    notes: ["Ámbar", "Vainilla"],
    tag: "Árabe",
    product_variants: [
      { id: "decant-uuid-1", label: "3 ml", variant_kind: "decant", size_ml: 3, price_amount: "12.00", currency: "PEN", publication_status: "published", archived_at: null, sort_order: 0, price_verification_status: "official_pdf" },
    ],
    product_media: [],
    product_categories: [
      { sort_order: 0, category: { business_unit_id: PARFUMS_BUSINESS_UNIT_ID, kind: "commercial_type", slug: "arab", name: "Árabe", publication_status: "published", archived_at: null } },
      { sort_order: 1, category: { business_unit_id: PARFUMS_BUSINESS_UNIT_ID, kind: "olfactory_family", slug: "ambar", name: "Ámbar", publication_status: "published", archived_at: null } },
    ],
    combos: null,
    ...overrides,
  };
}

function comboRow(overrides: Partial<PublicProductRow> = {}): PublicProductRow {
  return row({
    id: "00000000-0000-4000-8000-000000000099",
    legacy_id: "combo-cuarteto",
    slug: "combo-cuarteto",
    brand: null,
    name: "Cuarteto Oriental",
    gender: "unisex",
    product_variants: [
      { id: "combo-5ml-uuid", label: "Set 5 ml c/u", variant_kind: "decant", size_ml: 5, price_amount: "55.00", currency: "PEN", publication_status: "published", archived_at: null, sort_order: 0, price_verification_status: "official_pdf" },
      { id: "combo-10ml-uuid", label: "Set 10 ml c/u", variant_kind: "decant", size_ml: 10, price_amount: "89.00", currency: "PEN", publication_status: "published", archived_at: null, sort_order: 1, price_verification_status: "official_pdf" },
    ],
    product_categories: [
      { sort_order: 0, category: { business_unit_id: PARFUMS_BUSINESS_UNIT_ID, kind: "olfactory_family", slug: "oriental", name: "Oriental", publication_status: "published", archived_at: null } },
    ],
    combos: {
      composition_verification_status: "official_pdf",
      combo_items: [
        {
          product_variant_id: "ing-1a", combo_product_variant_id: "combo-5ml-uuid", quantity: 1, sort_order: 0,
          product_variants: { id: "ing-1a", product_id: "prod-ing-1", label: "3 ml", size_ml: 3, products: { brand: "Maison A", name: "Rose Oud" } },
          combo_product_variants: { id: "combo-5ml-uuid", product_id: "00000000-0000-4000-8000-000000000099", label: "Set 5 ml c/u", size_ml: 5, products: { brand: null, name: "Cuarteto Oriental" } },
        },
        {
          product_variant_id: "ing-2a", combo_product_variant_id: "combo-5ml-uuid", quantity: 1, sort_order: 1,
          product_variants: { id: "ing-2a", product_id: "prod-ing-2", label: "3 ml", size_ml: 3, products: { brand: "Maison B", name: "Oud Royal" } },
          combo_product_variants: { id: "combo-5ml-uuid", product_id: "00000000-0000-4000-8000-000000000099", label: "Set 5 ml c/u", size_ml: 5, products: { brand: null, name: "Cuarteto Oriental" } },
        },
        {
          product_variant_id: "ing-3a", combo_product_variant_id: "combo-5ml-uuid", quantity: 1, sort_order: 2,
          product_variants: { id: "ing-3a", product_id: "prod-ing-3", label: "3 ml", size_ml: 3, products: { brand: "Maison C", name: "Sandal Wood" } },
          combo_product_variants: { id: "combo-5ml-uuid", product_id: "00000000-0000-4000-8000-000000000099", label: "Set 5 ml c/u", size_ml: 5, products: { brand: null, name: "Cuarteto Oriental" } },
        },
        {
          product_variant_id: "ing-4a", combo_product_variant_id: "combo-5ml-uuid", quantity: 1, sort_order: 3,
          product_variants: { id: "ing-4a", product_id: "prod-ing-4", label: "3 ml", size_ml: 3, products: { brand: "Maison D", name: "Amber Musk" } },
          combo_product_variants: { id: "combo-5ml-uuid", product_id: "00000000-0000-4000-8000-000000000099", label: "Set 5 ml c/u", size_ml: 5, products: { brand: null, name: "Cuarteto Oriental" } },
        },
      ],
    },
    ...overrides,
  });
}

/* ------------------------------------------------------------------ */
/*  1. Canonical product identity                                       */
/* ------------------------------------------------------------------ */

describe("4K2-B0: canonical product identity", () => {
  it("maps productId from row.id and keeps legacyId as optional", () => {
    const product = mapPublicProduct(row());
    expect(product).not.toBeNull();
    expect(product!.productId).toBe("00000000-0000-4000-8000-000000000001");
    expect(product!.legacyId).toBe("test-parfum");
  });

  it("accepts supplemental products with null legacy_id", () => {
    const product = mapPublicProduct(row({
      id: "00000000-0000-4000-8000-000000000050",
      legacy_id: null,
      slug: "le-male-le-parfum",
      brand: "Jean Paul Gaultier",
      name: "Le Male Le Parfum",
    }));
    expect(product).not.toBeNull();
    expect(product!.productId).toBe("00000000-0000-4000-8000-000000000050");
    expect(product!.legacyId).toBeNull();
    expect(product!.slug).toBe("le-male-le-parfum");
  });
});

/* ------------------------------------------------------------------ */
/*  2. Canonical variant identity                                       */
/* ------------------------------------------------------------------ */

describe("4K2-B0: canonical variant identity", () => {
  it("maps dbVariantId from row variant id and keeps variantId as compatibility alias", () => {
    const product = mapPublicProduct(row());
    expect(product).not.toBeNull();
    const variant = product!.variants[0];
    expect(variant.dbVariantId).toBe("decant-uuid-1");
    expect(variant.variantId).toBe("decant-3ml");
  });

  it("preserves dbVariantId for all variant kinds", () => {
    const product = mapPublicProduct(row({
      product_variants: [
        { id: "dec-uuid-a", label: "3 ml", variant_kind: "decant", size_ml: 3, price_amount: "12.00", currency: "PEN", publication_status: "published", archived_at: null, sort_order: 0, price_verification_status: "official_pdf" },
        { id: "btl-uuid-b", label: "Frasco 100 ml", variant_kind: "bottle", size_ml: 100, price_amount: "130.00", currency: "PEN", publication_status: "published", archived_at: null, sort_order: 1, price_verification_status: "provisional_market" },
      ],
    }));
    expect(product!.variants.find((v) => v.kind === "decant")?.dbVariantId).toBe("dec-uuid-a");
    expect(product!.variants.find((v) => v.kind === "bottle")?.dbVariantId).toBe("btl-uuid-b");
  });
});

/* ------------------------------------------------------------------ */
/*  3. Existing-cart compatibility                                      */
/* ------------------------------------------------------------------ */

describe("4K2-B0: existing-cart compatibility", () => {
  it("legacy variantId format is still used for cart line identity", () => {
    const product = mapPublicProduct(row());
    expect(product!.variants[0].variantId).toMatch(/^(decant|bottle)-\d+ml$/);
  });

  it("legacyId remains available for backward-compatible cart lookup", () => {
    const product = mapPublicProduct(row({ legacy_id: "khamrah-clasico" }));
    expect(product!.legacyId).toBe("khamrah-clasico");
  });
});

/* ------------------------------------------------------------------ */
/*  4. Readiness classifier: variant-scoped                            */
/* ------------------------------------------------------------------ */

describe("4K2-B0: readiness classifier", () => {
  it("official_pdf decant is ready", () => {
    const variant: CatalogProductVariant = {
      dbVariantId: "v1", variantId: "decant-3ml", kind: "decant", sizeMl: "3",
      label: "3 ml", priceAmount: "12.00", currency: "PEN", sortOrder: 0,
      priceVerificationStatus: "official_pdf",
    };
    expect(classifyVariantReadiness(variant).ready).toBe(true);
  });

  it("provisional_market variant is NOT ready", () => {
    const variant: CatalogProductVariant = {
      dbVariantId: "v1", variantId: "bottle-100ml", kind: "bottle", sizeMl: "100",
      label: "Frasco 100 ml", priceAmount: "130.00", currency: "PEN", sortOrder: 0,
      priceVerificationStatus: "provisional_market",
    };
    const result = classifyVariantReadiness(variant);
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("variant_price_not_ready");
  });

  it("legacy variant is NOT ready", () => {
    const variant: CatalogProductVariant = {
      dbVariantId: "v1", variantId: "bottle-100ml", kind: "bottle", sizeMl: "100",
      label: "Frasco 100 ml", priceAmount: "750.00", currency: "PEN", sortOrder: 0,
      priceVerificationStatus: "legacy",
    };
    const result = classifyVariantReadiness(variant);
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("variant_price_not_ready");
  });

  it("official_pdf decant visible while non-ready bottle excluded (B2B.1)", () => {
    const product: CatalogProduct = {
      productId: "p1", legacyId: "test", slug: "test", brand: "Brand", name: "Test",
      gender: "unisex", type: "arab", family: "Ámbar", concentration: "EDP",
      decantPrices: { 3: 12 }, bottlePrices: { 100: 130 },
      notes: [], tag: "", description: "", discontinued: false, bestseller: false,
      hidden: false, availabilityStatus: "available",
      isFeatured: false, featuredRank: null, featuredFrom: null, featuredUntil: null,
      imageUrl: null, decantImageUrl: null, bottleImageUrl: null, imageAlt: "",
      verificationStatus: "legacy",
      bottlePricingVerificationStatus: "provisional_market",
      comboCompositionVerificationStatus: null, comboContent: null,
      variants: [
        { dbVariantId: "d1", variantId: "decant-3ml", kind: "decant", sizeMl: "3", label: "3 ml", priceAmount: "12.00", currency: "PEN", sortOrder: 0, priceVerificationStatus: "official_pdf" },
        { dbVariantId: "b1", variantId: "bottle-100ml", kind: "bottle", sizeMl: "100", label: "Frasco 100 ml", priceAmount: "130.00", currency: "PEN", sortOrder: 1, priceVerificationStatus: "provisional_market" },
      ],
      media: [],
    };
    const readiness = classifyProductReadiness(product);
    expect(readiness.ready).toBe(true);
    expect(readiness.readyVariants).toContain("decant-3ml");
    expect(readiness.readyVariants).not.toContain("bottle-100ml");
  });

  it("archived product is excluded", () => {
    const product = mapPublicProduct(row({
      publication_status: "published",
      archived_at: "2026-01-01T00:00:00Z",
    }));
    expect(product).toBeNull();
  });

  it("discontinued + available + official_pdf variant remains storefront-ready", () => {
    const product: CatalogProduct = {
      productId: "p1", legacyId: "disc-test", slug: "disc-test", brand: "Brand", name: "Disc Test",
      gender: "unisex", type: "arab", family: "F", concentration: "",
      decantPrices: { 3: 10 }, bottlePrices: null,
      notes: [], tag: "", description: "", discontinued: true, bestseller: false,
      hidden: false, availabilityStatus: "available",
      isFeatured: false, featuredRank: null, featuredFrom: null, featuredUntil: null,
      imageUrl: null, decantImageUrl: null, bottleImageUrl: null, imageAlt: "",
      verificationStatus: "legacy", bottlePricingVerificationStatus: null,
      comboCompositionVerificationStatus: null, comboContent: null,
      variants: [
        { dbVariantId: "v1", variantId: "decant-3ml", kind: "decant", sizeMl: "3", label: "3 ml", priceAmount: "10.00", currency: "PEN", sortOrder: 0, priceVerificationStatus: "official_pdf" },
      ],
      media: [],
    };
    expect(classifyProductReadiness(product).ready).toBe(true);
  });

  it("out_of_stock product availability is separate from readiness", () => {
    const product: CatalogProduct = {
      productId: "p1", legacyId: "oos-test", slug: "oos-test", brand: "Brand", name: "OOS Test",
      gender: "unisex", type: "arab", family: "F", concentration: "",
      decantPrices: { 3: 10 }, bottlePrices: null,
      notes: [], tag: "", description: "", discontinued: false, bestseller: false,
      hidden: false, availabilityStatus: "out_of_stock",
      isFeatured: false, featuredRank: null, featuredFrom: null, featuredUntil: null,
      imageUrl: null, decantImageUrl: null, bottleImageUrl: null, imageAlt: "",
      verificationStatus: "legacy", bottlePricingVerificationStatus: null,
      comboCompositionVerificationStatus: null, comboContent: null,
      variants: [
        { dbVariantId: "v1", variantId: "decant-3ml", kind: "decant", sizeMl: "3", label: "3 ml", priceAmount: "10.00", currency: "PEN", sortOrder: 0, priceVerificationStatus: "official_pdf" },
      ],
      media: [],
    };
    expect(classifyProductReadiness(product).ready).toBe(true);
  });

  it("filterStorefrontReady returns only products with at least one ready variant", () => {
    const ready: CatalogProduct = {
      productId: "p1", legacyId: "ready", slug: "ready", brand: "B", name: "Ready",
      gender: "unisex", type: "arab", family: "F", concentration: "",
      decantPrices: { 3: 10 }, bottlePrices: null,
      notes: [], tag: "", description: "", discontinued: false, bestseller: false,
      hidden: false, availabilityStatus: "available",
      isFeatured: false, featuredRank: null, featuredFrom: null, featuredUntil: null,
      imageUrl: null, decantImageUrl: null, bottleImageUrl: null, imageAlt: "",
      verificationStatus: "legacy", bottlePricingVerificationStatus: null,
      comboCompositionVerificationStatus: null, comboContent: null,
      variants: [
        { dbVariantId: "v1", variantId: "decant-3ml", kind: "decant", sizeMl: "3", label: "3 ml", priceAmount: "10.00", currency: "PEN", sortOrder: 0, priceVerificationStatus: "official_pdf" },
      ],
      media: [],
    };
    const blocked: CatalogProduct = {
      ...ready,
      productId: "p2", legacyId: "blocked", slug: "blocked", name: "Blocked",
      variants: [
        { dbVariantId: "v2", variantId: "decant-3ml", kind: "decant", sizeMl: "3", label: "3 ml", priceAmount: "10.00", currency: "PEN", sortOrder: 0, priceVerificationStatus: "legacy" },
      ],
    };
    expect(filterStorefrontReady([ready, blocked])).toEqual([ready]);
  });
});

/* ------------------------------------------------------------------ */
/*  5. Combo classification without commercial_type                    */
/* ------------------------------------------------------------------ */

describe("4K2-B0: combo classification", () => {
  it("combo product is classified as combo without commercial_type category", () => {
    const product = mapPublicProduct(comboRow());
    expect(product).not.toBeNull();
    expect(product!.type).toBe("combo");
    expect(product!.legacyId).toBe("combo-cuarteto");
  });

  it("combo products do not require decant variants", () => {
    const product = mapPublicProduct(comboRow({
      product_variants: [
        { id: "combo-uuid", label: "Set 5 ml c/u", variant_kind: "decant", size_ml: 5, price_amount: "55.00", currency: "PEN", publication_status: "published", archived_at: null, sort_order: 0, price_verification_status: "official_pdf" },
      ],
    }));
    expect(product).not.toBeNull();
    expect(product!.variants).toHaveLength(1);
    expect(product!.type).toBe("combo");
  });

  it("comboCompositionVerificationStatus maps from combos table", () => {
    const product = mapPublicProduct(comboRow({
      combos: { composition_verification_status: "official_pdf" },
    }));
    expect(product!.comboCompositionVerificationStatus).toBe("official_pdf");
  });

  it("missing combo (combos: null) still maps as non-combo", () => {
    const product = mapPublicProduct(row({ combos: null }));
    expect(product!.type).not.toBe("combo");
  });
});

/* ------------------------------------------------------------------ */
/*  6. Combo read model (listCombos)                                   */
/* ------------------------------------------------------------------ */

describe("4K2-B0: combo read model", () => {
  it("listCombos returns combo products separately", () => {
    const repository = SupabasePublicCatalogRepository.fromPublicRows([
      row(),
      comboRow(),
    ]);
    expect(repository.listCombos()).toHaveLength(1);
    expect(repository.listCombos()[0].type).toBe("combo");
  });

  it("listFragrances excludes combos", () => {
    const repository = SupabasePublicCatalogRepository.fromPublicRows([
      row(),
      comboRow(),
    ]);
    expect(repository.listFragrances()).toHaveLength(1);
    expect(repository.listFragrances()[0].type).not.toBe("combo");
  });

  it("findBySlug finds combos too", () => {
    const repository = SupabasePublicCatalogRepository.fromPublicRows([comboRow()]);
    expect(repository.findBySlug("combo-cuarteto")?.type).toBe("combo");
  });

  it("findByLegacyId finds combos too", () => {
    const repository = SupabasePublicCatalogRepository.fromPublicRows([comboRow()]);
    expect(repository.findByLegacyId("combo-cuarteto")?.type).toBe("combo");
  });

  it("findByProductId finds combos too", () => {
    const repository = SupabasePublicCatalogRepository.fromPublicRows([comboRow()]);
    expect(repository.findByProductId("00000000-0000-4000-8000-000000000099")?.type).toBe("combo");
  });
});

/* ------------------------------------------------------------------ */
/*  7b. Combo composition read model                                    */
/* ------------------------------------------------------------------ */

describe("4K2-B0.1: combo composition read model", () => {
  it("Cuarteto-style 4-member presentation composition maps correctly", () => {
    const product = mapPublicProduct(comboRow());
    expect(product).not.toBeNull();
    expect(product!.comboContent).not.toBeNull();
    expect(product!.comboContent!.perfumes).toHaveLength(4);
    expect(product!.comboContent!.perfumes).toContain("Maison A Rose Oud");
    expect(product!.comboContent!.perfumes).toContain("Maison B Oud Royal");
    expect(product!.comboContent!.perfumes).toContain("Maison C Sandal Wood");
    expect(product!.comboContent!.perfumes).toContain("Maison D Amber Musk");
  });

  it("presentation variant UUID/price preserved", () => {
    const product = mapPublicProduct(comboRow());
    expect(product!.variants).toHaveLength(2);
    expect(product!.variants[0].dbVariantId).toBe("combo-5ml-uuid");
    expect(product!.variants[0].priceAmount).toBe("55.00");
    expect(product!.variants[1].dbVariantId).toBe("combo-10ml-uuid");
    expect(product!.variants[1].priceAmount).toBe("89.00");
  });

  it("ingredient variant UUIDs preserved in combo_items", () => {
    const product = mapPublicProduct(comboRow());
    expect(product!.comboContent).not.toBeNull();
    expect(product!.comboContent!.perfumes).toHaveLength(4);
  });

  it("official_pdf composition status preserved", () => {
    const product = mapPublicProduct(comboRow({
      combos: {
        composition_verification_status: "official_pdf",
        combo_items: [
          {
            product_variant_id: "ing-1a", combo_product_variant_id: "combo-5ml-uuid", quantity: 1, sort_order: 0,
            product_variants: { id: "ing-1a", product_id: "prod-ing-1", label: "3 ml", size_ml: 3, products: { brand: "Maison A", name: "Rose Oud" } },
            combo_product_variants: { id: "combo-5ml-uuid", product_id: "00000000-0000-4000-8000-000000000099", label: "Set 5 ml c/u", size_ml: 5, products: { brand: null, name: "Cuarteto Oriental" } },
          },
        ],
      },
    }));
    expect(product!.comboCompositionVerificationStatus).toBe("official_pdf");
    expect(product!.comboContent!.verificationStatus).toBe("official_pdf");
  });

  it("missing combo_items fails closed (empty comboContent)", () => {
    const product = mapPublicProduct(comboRow({
      combos: { composition_verification_status: "official_pdf", combo_items: [] },
    }));
    expect(product).not.toBeNull();
    expect(product!.comboContent).toBeNull();
  });

  it("malformed combo_items (missing product) fails closed", () => {
    const product = mapPublicProduct(comboRow({
      combos: {
        composition_verification_status: "official_pdf",
        combo_items: [
          {
            product_variant_id: "ing-1a", combo_product_variant_id: "combo-5ml-uuid", quantity: 1, sort_order: 0,
            product_variants: { id: "ing-1a", product_id: "prod-ing-1", label: "3 ml", size_ml: 3, products: { brand: null, name: "" } },
            combo_product_variants: { id: "combo-5ml-uuid", product_id: "00000000-0000-4000-8000-000000000099", label: "Set 5 ml c/u", size_ml: 5, products: { brand: null, name: "Cuarteto Oriental" } },
          },
        ],
      },
    }));
    expect(product).not.toBeNull();
    expect(product!.comboContent).toBeNull();
  });

  it("no commercial_type category is required for combo classification", () => {
    const product = mapPublicProduct(comboRow({
      product_categories: [],
    }));
    expect(product).not.toBeNull();
    expect(product!.type).toBe("combo");
  });

  it("Tulum/Vainilla-style 3-member composition maps correctly", () => {
    const product = mapPublicProduct(comboRow({
      name: "Tulum Vibes",
      combos: {
        composition_verification_status: "official_pdf",
        combo_items: [
          {
            product_variant_id: "tul-1a", combo_product_variant_id: "combo-5ml-uuid", quantity: 1, sort_order: 0,
            product_variants: { id: "tul-1a", product_id: "prod-t-1", label: "3 ml", size_ml: 3, products: { brand: "Maison X", name: "Tulum Sand" } },
            combo_product_variants: { id: "combo-5ml-uuid", product_id: "00000000-0000-4000-8000-000000000099", label: "Set 5 ml c/u", size_ml: 5, products: { brand: null, name: "Tulum Vibes" } },
          },
          {
            product_variant_id: "tul-2a", combo_product_variant_id: "combo-5ml-uuid", quantity: 1, sort_order: 1,
            product_variants: { id: "tul-2a", product_id: "prod-t-2", label: "3 ml", size_ml: 3, products: { brand: "Maison Y", name: "Tulum Sea" } },
            combo_product_variants: { id: "combo-5ml-uuid", product_id: "00000000-0000-4000-8000-000000000099", label: "Set 5 ml c/u", size_ml: 5, products: { brand: null, name: "Tulum Vibes" } },
          },
          {
            product_variant_id: "tul-3a", combo_product_variant_id: "combo-5ml-uuid", quantity: 1, sort_order: 2,
            product_variants: { id: "tul-3a", product_id: "prod-t-3", label: "3 ml", size_ml: 3, products: { brand: "Maison Z", name: "Tulum Sun" } },
            combo_product_variants: { id: "combo-5ml-uuid", product_id: "00000000-0000-4000-8000-000000000099", label: "Set 5 ml c/u", size_ml: 5, products: { brand: null, name: "Tulum Vibes" } },
          },
        ],
      },
    }));
    expect(product).not.toBeNull();
    expect(product!.comboContent).not.toBeNull();
    expect(product!.comboContent!.perfumes).toHaveLength(3);
    expect(product!.comboContent!.perfumes).toContain("Maison X Tulum Sand");
  });

  it("combo price is NOT derived from ingredient sums", () => {
    const product = mapPublicProduct(comboRow());
    expect(product!.variants[0].priceAmount).toBe("55.00");
    expect(product!.variants[1].priceAmount).toBe("89.00");
  });
});

/* ------------------------------------------------------------------ */
/*  7c. Combo presentation-aware model                                  */
/* ------------------------------------------------------------------ */

describe("4K2-B0.2: combo presentation-aware model", () => {
  it("comboPresentations populated from combo_items grouped by combo_product_variant_id", () => {
    // The default fixture has items for the 5 ml combo variant only; the
    // 10 ml variant has no items and must NOT produce an empty presentation
    // (see the "excluded" case below).
    const product = mapPublicProduct(comboRow());
    expect(product).not.toBeNull();
    expect(product!.comboPresentations).toHaveLength(1);
    const sizes = product!.comboPresentations.map((p) => p.sizeMl);
    expect(sizes).toContain("5");
    expect(sizes).not.toContain("10");
  });

  it("5ml presentation has 4 ingredient items", () => {
    const product = mapPublicProduct(comboRow());
    const p5ml = product!.comboPresentations.find((p) => p.sizeMl === "5");
    expect(p5ml).toBeDefined();
    expect(p5ml!.items).toHaveLength(4);
    expect(p5ml!.comboVariantId).toBe("combo-5ml-uuid");
    expect(p5ml!.priceAmount).toBe("55.00");
  });

  it("10ml presentation with no combo_items is excluded", () => {
    const product = mapPublicProduct(comboRow());
    const p10ml = product!.comboPresentations.find((p) => p.sizeMl === "10");
    expect(p10ml).toBeUndefined();
  });

  it("ingredient UUIDs preserved in comboPresentations", () => {
    const product = mapPublicProduct(comboRow());
    const p5ml = product!.comboPresentations.find((p) => p.sizeMl === "5");
    const ingIds = p5ml!.items.map((i) => i.ingredientVariantId);
    expect(ingIds).toContain("ing-1a");
    expect(ingIds).toContain("ing-2a");
    expect(ingIds).toContain("ing-3a");
    expect(ingIds).toContain("ing-4a");
  });

  it("combo presentation UUID preserved", () => {
    const product = mapPublicProduct(comboRow());
    const p5ml = product!.comboPresentations.find((p) => p.sizeMl === "5");
    expect(p5ml!.comboVariantId).toBe("combo-5ml-uuid");
  });

  it("ingredient prices never derive combo price", () => {
    const product = mapPublicProduct(comboRow());
    const p5ml = product!.comboPresentations.find((p) => p.sizeMl === "5");
    expect(p5ml!.priceAmount).toBe("55.00");
  });

  it("3-presentation/9-item structure for Cuarteto-like combo", () => {
    const product = mapPublicProduct(comboRow({
      combos: {
        composition_verification_status: "official_pdf",
        combo_items: [
          { product_variant_id: "ing-1a", combo_product_variant_id: "combo-3ml-uuid", quantity: 1, sort_order: 0,
            product_variants: { id: "ing-1a", product_id: "p1", label: "3 ml", size_ml: 3, products: { brand: "A", name: "Rose" } },
            combo_product_variants: { id: "combo-3ml-uuid", product_id: "prod", label: "3 ml", size_ml: 3, products: { brand: null, name: "C" } } },
          { product_variant_id: "ing-1b", combo_product_variant_id: "combo-3ml-uuid", quantity: 1, sort_order: 1,
            product_variants: { id: "ing-1b", product_id: "p2", label: "3 ml", size_ml: 3, products: { brand: "B", name: "Oud" } },
            combo_product_variants: { id: "combo-3ml-uuid", product_id: "prod", label: "3 ml", size_ml: 3, products: { brand: null, name: "C" } } },
          { product_variant_id: "ing-1c", combo_product_variant_id: "combo-3ml-uuid", quantity: 1, sort_order: 2,
            product_variants: { id: "ing-1c", product_id: "p3", label: "3 ml", size_ml: 3, products: { brand: "C", name: "Sandal" } },
            combo_product_variants: { id: "combo-3ml-uuid", product_id: "prod", label: "3 ml", size_ml: 3, products: { brand: null, name: "C" } } },
          { product_variant_id: "ing-1d", combo_product_variant_id: "combo-3ml-uuid", quantity: 1, sort_order: 3,
            product_variants: { id: "ing-1d", product_id: "p4", label: "3 ml", size_ml: 3, products: { brand: "D", name: "Amber" } },
            combo_product_variants: { id: "combo-3ml-uuid", product_id: "prod", label: "3 ml", size_ml: 3, products: { brand: null, name: "C" } } },
          { product_variant_id: "ing-2a", combo_product_variant_id: "combo-5ml-uuid", quantity: 1, sort_order: 0,
            product_variants: { id: "ing-2a", product_id: "p1", label: "3 ml", size_ml: 3, products: { brand: "A", name: "Rose" } },
            combo_product_variants: { id: "combo-5ml-uuid", product_id: "prod", label: "5 ml", size_ml: 5, products: { brand: null, name: "C" } } },
          { product_variant_id: "ing-2b", combo_product_variant_id: "combo-5ml-uuid", quantity: 1, sort_order: 1,
            product_variants: { id: "ing-2b", product_id: "p2", label: "3 ml", size_ml: 3, products: { brand: "B", name: "Oud" } },
            combo_product_variants: { id: "combo-5ml-uuid", product_id: "prod", label: "5 ml", size_ml: 5, products: { brand: null, name: "C" } } },
          { product_variant_id: "ing-2c", combo_product_variant_id: "combo-5ml-uuid", quantity: 1, sort_order: 2,
            product_variants: { id: "ing-2c", product_id: "p3", label: "3 ml", size_ml: 3, products: { brand: "C", name: "Sandal" } },
            combo_product_variants: { id: "combo-5ml-uuid", product_id: "prod", label: "5 ml", size_ml: 5, products: { brand: null, name: "C" } } },
          { product_variant_id: "ing-2d", combo_product_variant_id: "combo-5ml-uuid", quantity: 1, sort_order: 3,
            product_variants: { id: "ing-2d", product_id: "p4", label: "3 ml", size_ml: 3, products: { brand: "D", name: "Amber" } },
            combo_product_variants: { id: "combo-5ml-uuid", product_id: "prod", label: "5 ml", size_ml: 5, products: { brand: null, name: "C" } } },
          { product_variant_id: "ing-3a", combo_product_variant_id: "combo-10ml-uuid", quantity: 1, sort_order: 0,
            product_variants: { id: "ing-3a", product_id: "p1", label: "3 ml", size_ml: 3, products: { brand: "A", name: "Rose" } },
            combo_product_variants: { id: "combo-10ml-uuid", product_id: "prod", label: "10 ml", size_ml: 10, products: { brand: null, name: "C" } } },
          { product_variant_id: "ing-3b", combo_product_variant_id: "combo-10ml-uuid", quantity: 1, sort_order: 1,
            product_variants: { id: "ing-3b", product_id: "p2", label: "3 ml", size_ml: 3, products: { brand: "B", name: "Oud" } },
            combo_product_variants: { id: "combo-10ml-uuid", product_id: "prod", label: "10 ml", size_ml: 10, products: { brand: null, name: "C" } } },
          { product_variant_id: "ing-3c", combo_product_variant_id: "combo-10ml-uuid", quantity: 1, sort_order: 2,
            product_variants: { id: "ing-3c", product_id: "p3", label: "3 ml", size_ml: 3, products: { brand: "C", name: "Sandal" } },
            combo_product_variants: { id: "combo-10ml-uuid", product_id: "prod", label: "10 ml", size_ml: 10, products: { brand: null, name: "C" } } },
          { product_variant_id: "ing-3d", combo_product_variant_id: "combo-10ml-uuid", quantity: 1, sort_order: 3,
            product_variants: { id: "ing-3d", product_id: "p4", label: "3 ml", size_ml: 3, products: { brand: "D", name: "Amber" } },
            combo_product_variants: { id: "combo-10ml-uuid", product_id: "prod", label: "10 ml", size_ml: 10, products: { brand: null, name: "C" } } },
        ],
      },
      product_variants: [
        { id: "combo-3ml-uuid", label: "Set 3 ml c/u", variant_kind: "decant", size_ml: 3, price_amount: "40.00", currency: "PEN", publication_status: "published", archived_at: null, sort_order: 0, price_verification_status: "official_pdf" },
        { id: "combo-5ml-uuid", label: "Set 5 ml c/u", variant_kind: "decant", size_ml: 5, price_amount: "55.00", currency: "PEN", publication_status: "published", archived_at: null, sort_order: 1, price_verification_status: "official_pdf" },
        { id: "combo-10ml-uuid", label: "Set 10 ml c/u", variant_kind: "decant", size_ml: 10, price_amount: "89.00", currency: "PEN", publication_status: "published", archived_at: null, sort_order: 2, price_verification_status: "official_pdf" },
      ],
    }));
    expect(product).not.toBeNull();
    expect(product!.comboPresentations).toHaveLength(3);
    const sizes = product!.comboPresentations.map((p) => p.sizeMl).sort();
    expect(sizes).toEqual(["10", "3", "5"]);
    for (const pres of product!.comboPresentations) {
      expect(pres.items).toHaveLength(4);
      expect(pres.currency).toBe("PEN");
    }
    const prices = product!.comboPresentations.map((p) => p.priceAmount).sort();
    expect(prices).toEqual(["40.00", "55.00", "89.00"]);
  });

  it("3-presentation/9-item structure for Tulum-like 3-member combo", () => {
    const product = mapPublicProduct(comboRow({
      name: "Tulum Vibes",
      combos: {
        composition_verification_status: "official_pdf",
        combo_items: [
          { product_variant_id: "tul-1a", combo_product_variant_id: "combo-5ml-uuid", quantity: 1, sort_order: 0,
            product_variants: { id: "tul-1a", product_id: "pt1", label: "3 ml", size_ml: 3, products: { brand: "X", name: "Sand" } },
            combo_product_variants: { id: "combo-5ml-uuid", product_id: "prod", label: "5 ml", size_ml: 5, products: { brand: null, name: "Tulum" } } },
          { product_variant_id: "tul-2a", combo_product_variant_id: "combo-5ml-uuid", quantity: 1, sort_order: 1,
            product_variants: { id: "tul-2a", product_id: "pt2", label: "3 ml", size_ml: 3, products: { brand: "Y", name: "Sea" } },
            combo_product_variants: { id: "combo-5ml-uuid", product_id: "prod", label: "5 ml", size_ml: 5, products: { brand: null, name: "Tulum" } } },
          { product_variant_id: "tul-3a", combo_product_variant_id: "combo-5ml-uuid", quantity: 1, sort_order: 2,
            product_variants: { id: "tul-3a", product_id: "pt3", label: "3 ml", size_ml: 3, products: { brand: "Z", name: "Sun" } },
            combo_product_variants: { id: "combo-5ml-uuid", product_id: "prod", label: "5 ml", size_ml: 5, products: { brand: null, name: "Tulum" } } },
          { product_variant_id: "tul-1b", combo_product_variant_id: "combo-10ml-uuid", quantity: 1, sort_order: 0,
            product_variants: { id: "tul-1b", product_id: "pt1", label: "3 ml", size_ml: 3, products: { brand: "X", name: "Sand" } },
            combo_product_variants: { id: "combo-10ml-uuid", product_id: "prod", label: "10 ml", size_ml: 10, products: { brand: null, name: "Tulum" } } },
          { product_variant_id: "tul-2b", combo_product_variant_id: "combo-10ml-uuid", quantity: 1, sort_order: 1,
            product_variants: { id: "tul-2b", product_id: "pt2", label: "3 ml", size_ml: 3, products: { brand: "Y", name: "Sea" } },
            combo_product_variants: { id: "combo-10ml-uuid", product_id: "prod", label: "10 ml", size_ml: 10, products: { brand: null, name: "Tulum" } } },
          { product_variant_id: "tul-3b", combo_product_variant_id: "combo-10ml-uuid", quantity: 1, sort_order: 2,
            product_variants: { id: "tul-3b", product_id: "pt3", label: "3 ml", size_ml: 3, products: { brand: "Z", name: "Sun" } },
            combo_product_variants: { id: "combo-10ml-uuid", product_id: "prod", label: "10 ml", size_ml: 10, products: { brand: null, name: "Tulum" } } },
        ],
      },
      product_variants: [
        { id: "combo-5ml-uuid", label: "Set 5 ml c/u", variant_kind: "decant", size_ml: 5, price_amount: "55.00", currency: "PEN", publication_status: "published", archived_at: null, sort_order: 0, price_verification_status: "official_pdf" },
        { id: "combo-10ml-uuid", label: "Set 10 ml c/u", variant_kind: "decant", size_ml: 10, price_amount: "89.00", currency: "PEN", publication_status: "published", archived_at: null, sort_order: 1, price_verification_status: "official_pdf" },
      ],
    }));
    expect(product).not.toBeNull();
    expect(product!.comboPresentations).toHaveLength(2);
    for (const pres of product!.comboPresentations) {
      expect(pres.items).toHaveLength(3);
    }
  });

  it("ingredient product UUIDs preserved in comboPresentations", () => {
    const product = mapPublicProduct(comboRow());
    const p5ml = product!.comboPresentations.find((p) => p.sizeMl === "5");
    const productIds = p5ml!.items.map((i) => i.ingredientProductId);
    expect(productIds).toContain("prod-ing-1");
    expect(productIds).toContain("prod-ing-2");
    expect(productIds).toContain("prod-ing-3");
    expect(productIds).toContain("prod-ing-4");
  });

  it("missing combo_items produces empty comboPresentations", () => {
    const product = mapPublicProduct(comboRow({
      combos: { composition_verification_status: "official_pdf", combo_items: [] },
    }));
    expect(product!.comboPresentations).toHaveLength(0);
  });

  it("no combo (non-combo product) has empty comboPresentations", () => {
    const product = mapPublicProduct(row());
    expect(product!.comboPresentations).toHaveLength(0);
  });

  it("sort_order preserved in combo presentation items", () => {
    const product = mapPublicProduct(comboRow());
    const p5ml = product!.comboPresentations.find((p) => p.sizeMl === "5");
    const sortOrders = p5ml!.items.map((i) => i.sortOrder);
    expect(sortOrders).toEqual([0, 1, 2, 3]);
  });

  it("incomplete composition (missing presentation variant) fails closed", () => {
    const product = mapPublicProduct(comboRow({
      combos: {
        composition_verification_status: "official_pdf",
        combo_items: [
          { product_variant_id: "ing-1a", combo_product_variant_id: "combo-nonexistent-uuid", quantity: 1, sort_order: 0,
            product_variants: { id: "ing-1a", product_id: "p1", label: "3 ml", size_ml: 3, products: { brand: "A", name: "Rose" } },
            combo_product_variants: { id: "combo-nonexistent-uuid", product_id: "prod", label: "5 ml", size_ml: 5, products: { brand: null, name: "C" } } },
        ],
      },
    }));
    expect(product!.comboPresentations).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  7. Media transition contract                                       */
/* ------------------------------------------------------------------ */

describe("4K2-B0: media transition contract", () => {
  it("accepts cloudinary media", () => {
    const product = mapPublicProduct(row({
      product_media: [
        { provider: "cloudinary", secure_url: "https://res.cloudinary.com/demo/img.webp", alt: null, is_primary: true, sort_order: 0, archived_at: null, product_variant_id: null, media_role: "set" },
      ],
    }));
    expect(product!.media).toHaveLength(1);
    expect(product!.media[0].url).toContain("cloudinary");
  });

  it("accepts legacy_static media with https URL", () => {
    const product = mapPublicProduct(row({
      product_media: [
        { provider: "legacy_static", secure_url: "https://abel-castill0.github.io/cruzialparfums/img/test.webp", alt: null, is_primary: true, sort_order: 0, archived_at: null, product_variant_id: null, media_role: null },
      ],
    }));
    expect(product!.media).toHaveLength(1);
    expect(product!.media[0].url).toContain("github.io");
  });

  it.each([
    ["http://", "http://legacy.example/img/local.webp"],
    ["protocol-relative", "//legacy.example/img/local.webp"],
    ["data:", "data:image/webp;base64,AAAA"],
    ["relative without leading slash", "img/local.webp"],
  ])("rejects legacy_static media with a %s URL", (_label, url) => {
    const product = mapPublicProduct(row({
      product_media: [
        { provider: "legacy_static", secure_url: url, alt: null, is_primary: true, sort_order: 0, archived_at: null, product_variant_id: null, media_role: null },
      ],
    }));
    expect(product!.media).toHaveLength(0);
    expect(product!.imageUrl).toBeNull();
  });

  it("accepts legacy_static media only as a root-relative path this app serves itself", () => {
    const product = mapPublicProduct(row({
      product_media: [
        { provider: "legacy_static", secure_url: "/parfums/combos/set-cuarteto.webp", alt: null, is_primary: true, sort_order: 0, archived_at: null, product_variant_id: null, media_role: "set" },
        { provider: "cloudinary", secure_url: "/parfums/combos/not-cloudinary.webp", alt: null, is_primary: false, sort_order: 1, archived_at: null, product_variant_id: null, media_role: null },
      ],
    }));
    expect(product!.media.map((item) => item.url)).toEqual(["/parfums/combos/set-cuarteto.webp"]);
    expect(product!.imageUrl).toBe("/parfums/combos/set-cuarteto.webp");
  });

  it("maps a hero-role media to comboContent.heroImageUrl without treating it as the product image", () => {
    const product = mapPublicProduct(comboRow({
      product_media: [
        { provider: "legacy_static", secure_url: "/parfums/combos/set-cuarteto.webp", alt: null, is_primary: true, sort_order: 0, archived_at: null, product_variant_id: null, media_role: "set" },
        { provider: "legacy_static", secure_url: "/parfums/hero/promo-cuarteto.webp", alt: null, is_primary: false, sort_order: 1, archived_at: null, product_variant_id: null, media_role: "hero" },
      ],
    }));
    expect(product!.imageUrl).toBe("/parfums/combos/set-cuarteto.webp");
    expect(product!.media.map((item) => item.url)).toEqual(["/parfums/combos/set-cuarteto.webp"]);
    expect(product!.comboContent?.heroImageUrl).toBe("/parfums/hero/promo-cuarteto.webp");
  });

  it("missing media produces null imageUrl", () => {
    const product = mapPublicProduct(row({ product_media: [] }));
    expect(product!.media).toHaveLength(0);
    expect(product!.imageUrl).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  8. Public contact settings                                          */
/* ------------------------------------------------------------------ */

describe("4K2-B0: public contact settings", () => {
  it("mapPublicContact accepts valid contact", () => {
    const result = mapPublicContact({
      whatsappNumber: "51926390591",
      whatsappDisplay: "926 390 591",
      contactEmail: "dominiocruzial@gmail.com",
    });
    expect(result).not.toBeNull();
    expect(result!.whatsappNumber).toBe("51926390591");
  });

  it("mapPublicContact rejects null/invalid", () => {
    expect(mapPublicContact(null)).toBeNull();
    expect(mapPublicContact("string")).toBeNull();
    expect(mapPublicContact({})).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  9. Order snapshot contract                                          */
/* ------------------------------------------------------------------ */

describe("4K2-B0: order snapshot contract", () => {
  it("ParfumsOrderLineSnapshot includes product_id and source fields", () => {
    const repo = new LegacyCatalogRepository();
    const product = repo.list().find((p) => p.availabilityStatus === "available" && listProductPurchaseVariants(p).length > 0)!;
    const variant = listProductPurchaseVariants(product)[0]!;
    const result = validateAndResolveParfumsOrder({
      requestId: "12345678-1234-4123-8123-123456789abc",
      lines: [{ productId: product.legacyId!, variantId: variant.variantId, quantity: 1 }],
      customer: { name: "Test User", phone: "999111222", district: "Lima", delivery: "Agencia Shalom (Lima y todo el Perú)", note: "" },
    }, repo);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines[0]).toHaveProperty("source");
    expect(result.lines[0].source).toMatch(/^(assets\/data\.js|supabase_catalog)$/);
    expect(result.lines[0]).toHaveProperty("product_id");
    expect(result.lines[0]).toHaveProperty("product_variant_id");
    expect(result.lines[0]).toHaveProperty("legacy_product_id");
    expect(result.lines[0]).toHaveProperty("legacy_variant_id");
  });
});

/* ------------------------------------------------------------------ */
/*  10. Legacy repository backward compat                              */
/* ------------------------------------------------------------------ */

describe("4K2-B0: legacy repository backward compat", () => {
  it("legacy products have productId: null and dbVariantId: null", () => {
    const repo = new LegacyCatalogRepository();
    const product = repo.list()[0];
    expect(product.productId).toBeNull();
    expect(product.variants[0].dbVariantId).toBeNull();
    expect(product.variants[0].variantId).toMatch(/^(decant|bottle)-\d+ml$/);
  });

  it("legacy findByProductId returns null", () => {
    const repo = new LegacyCatalogRepository();
    expect(repo.findByProductId("anything")).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  11. Pre-publication readiness classifier                            */
/* ------------------------------------------------------------------ */

describe("4K2-B0.1: pre-publication readiness", () => {
  it("published + official_pdf variant is ready", () => {
    const result = classifyPrePublicationReadiness({
      publication_status: "published",
      archived_at: null,
      variants: [
        { publication_status: "published", price_verification_status: "official_pdf" },
      ],
    });
    expect(result.ready).toBe(true);
    expect(result.readyVariantCount).toBe(1);
    expect(result.blockers).toHaveLength(0);
  });

  it("draft product with ready variants IS eligible for publication", () => {
    const result = classifyPrePublicationReadiness({
      publication_status: "draft",
      archived_at: null,
      variants: [
        { publication_status: "published", price_verification_status: "official_pdf" },
      ],
    });
    expect(result.ready).toBe(true);
    expect(result.readyVariantCount).toBe(1);
    expect(result.blockers).toHaveLength(0);
  });

  it("hidden product is NOT ready", () => {
    const result = classifyPrePublicationReadiness({
      publication_status: "hidden",
      archived_at: null,
      variants: [
        { publication_status: "published", price_verification_status: "official_pdf" },
      ],
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("product_hidden");
  });

  it("archived product is NOT ready", () => {
    const result = classifyPrePublicationReadiness({
      publication_status: "published",
      archived_at: "2026-01-01T00:00:00Z",
      variants: [
        { publication_status: "published", price_verification_status: "official_pdf" },
      ],
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("product_archived");
  });

  it("discontinued + available + official_pdf is STILL ready", () => {
    const result = classifyPrePublicationReadiness({
      publication_status: "published",
      archived_at: null,
      variants: [
        { publication_status: "published", price_verification_status: "official_pdf" },
      ],
    });
    expect(result.ready).toBe(true);
  });

  it("draft variant with official_pdf IS eligible for publication", () => {
    const result = classifyPrePublicationReadiness({
      publication_status: "published",
      archived_at: null,
      variants: [
        { publication_status: "draft", price_verification_status: "official_pdf" },
      ],
    });
    expect(result.ready).toBe(true);
    expect(result.readyVariantCount).toBe(1);
  });

  it("provisional_market variant is NOT ready", () => {
    const result = classifyPrePublicationReadiness({
      publication_status: "published",
      archived_at: null,
      variants: [
        { publication_status: "published", price_verification_status: "provisional_market" },
      ],
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("variant_price_not_ready");
  });
});

/* ------------------------------------------------------------------ */
/*  12. Media HTTPS-only policy                                        */
/* ------------------------------------------------------------------ */

describe("4K2-B0.1: media HTTPS-only policy", () => {
  it("accepts HTTPS cloudinary media", () => {
    const product = mapPublicProduct(row({
      product_media: [
        { provider: "cloudinary", secure_url: "https://res.cloudinary.com/demo/img.webp", alt: null, is_primary: true, sort_order: 0, archived_at: null, product_variant_id: null, media_role: "set" },
      ],
    }));
    expect(product!.media).toHaveLength(1);
  });

  it("accepts HTTPS legacy_static media", () => {
    const product = mapPublicProduct(row({
      product_media: [
        { provider: "legacy_static", secure_url: "https://abel-castill0.github.io/cruzialparfums/img/test.webp", alt: null, is_primary: true, sort_order: 0, archived_at: null, product_variant_id: null, media_role: null },
      ],
    }));
    expect(product!.media).toHaveLength(1);
  });

  it("rejects HTTP legacy_static media (insecure)", () => {
    const product = mapPublicProduct(row({
      product_media: [
        { provider: "legacy_static", secure_url: "http://abel-castill0.github.io/cruzialparfums/img/test.webp", alt: null, is_primary: true, sort_order: 0, archived_at: null, product_variant_id: null, media_role: null },
      ],
    }));
    expect(product!.media).toHaveLength(0);
  });

  it("rejects HTTP cloudinary media (insecure)", () => {
    const product = mapPublicProduct(row({
      product_media: [
        { provider: "cloudinary", secure_url: "http://res.cloudinary.com/demo/img.webp", alt: null, is_primary: true, sort_order: 0, archived_at: null, product_variant_id: null, media_role: null },
      ],
    }));
    expect(product!.media).toHaveLength(0);
  });
});
