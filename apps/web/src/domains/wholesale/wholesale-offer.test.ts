import { describe, expect, it } from "vitest";
import type { CatalogProduct, CatalogProductVariant } from "@/domains/catalog/types";
import {
  buildWholesaleOffers,
  filterWholesaleOffers,
  mapWholesalePolicies,
  type WholesalePolicyRow,
} from "./wholesale-offer";

function variant(kind: "decant" | "bottle", sizeMl: string, priceAmount: string): CatalogProductVariant {
  return {
    dbVariantId: `${kind}-${sizeMl}-uuid`,
    variantId: `${kind}-${sizeMl}ml`,
    kind,
    sizeMl,
    label: `${sizeMl} ml`,
    priceAmount,
    currency: "PEN",
    sortOrder: 0,
    priceVerificationStatus: "official_pdf",
  };
}

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    productId: "p-1",
    legacyId: "khamrah",
    slug: "khamrah",
    brand: "Lattafa",
    name: "Khamrah",
    gender: "unisex",
    type: "arab",
    family: "Gourmand",
    concentration: "EDP",
    decantPrices: { 3: 12 },
    bottlePrices: { 100: 130 },
    notes: [],
    tag: "",
    description: "",
    discontinued: false,
    bestseller: false,
    hidden: false,
    availabilityStatus: "available",
    isFeatured: false,
    featuredRank: null,
    featuredFrom: null,
    featuredUntil: null,
    imageUrl: null,
    decantImageUrl: null,
    bottleImageUrl: null,
    imageAlt: "",
    verificationStatus: "official_pdf",
    bottlePricingVerificationStatus: "official_pdf",
    comboCompositionVerificationStatus: null,
    comboContent: null,
    comboPresentations: [],
    variants: [variant("decant", "3", "12.00"), variant("bottle", "100", "130.00")],
    media: [],
    ...overrides,
  };
}

const POLICY_ROWS: WholesalePolicyRow[] = [
  { scope: "per_commercial_type", commercial_type: "arabic", name: "Mayorista Árabe", min_quantity: 40, discount_amount: 5, currency: "PEN", is_active: true, archived_at: null },
  { scope: "per_commercial_type", commercial_type: "designer", name: "Mayorista Diseñador", min_quantity: 40, discount_amount: "7.00", currency: "PEN", is_active: true, archived_at: null },
  { scope: "per_commercial_type", commercial_type: "niche", name: "Mayorista Nicho", min_quantity: 40, discount_amount: 10, currency: "PEN", is_active: true, archived_at: null },
];

describe("wholesale policies from database rows", () => {
  it("maps the client-confirmed per-category policy and normalizes the arabic slug", () => {
    const policies = mapWholesalePolicies(POLICY_ROWS);
    expect(policies.map((policy) => [policy.commercialType, policy.discountAmount, policy.minQuantity])).toEqual([
      ["arab", "5.00", 40],
      ["designer", "7.00", 40],
      ["niche", "10.00", 40],
    ]);
  });

  it.each([
    ["inactive", { is_active: false }],
    ["archived", { archived_at: "2026-09-01T00:00:00Z" }],
    ["unconfirmed scope", { scope: "unconfirmed" }],
    ["non-PEN currency", { currency: "USD" }],
    ["unknown commercial type", { commercial_type: "combo" }],
    ["missing discount", { discount_amount: null }],
    ["missing threshold", { min_quantity: null }],
  ])("ignores a policy row that is %s", (_label, patch) => {
    expect(mapWholesalePolicies([{ ...POLICY_ROWS[0]!, ...patch }])).toEqual([]);
  });
});

describe("wholesale offers", () => {
  const policies = mapWholesalePolicies(POLICY_ROWS);

  it("lists only bottle variants and derives the unit price from base minus discount", () => {
    const offers = buildWholesaleOffers([product()], policies);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      commercialType: "arab",
      basePriceAmount: "130.00",
      wholesaleUnitPriceAmount: "125.00",
      policy: { minQuantity: 40, discountAmount: "5.00" },
    });
    expect(offers[0]!.variant.kind).toBe("bottle");
  });

  it("never offers decants, combos or out_of_stock products", () => {
    const decantOnly = product({ variants: [variant("decant", "5", "16.00")] });
    const combo = product({ type: "combo", slug: "combo", productId: "p-c" });
    const soldOut = product({ availabilityStatus: "out_of_stock", slug: "so", productId: "p-so" });
    expect(buildWholesaleOffers([decantOnly, combo, soldOut], policies)).toEqual([]);
  });

  it("keeps a bottle visible with a null wholesale price when no policy covers its type", () => {
    const offers = buildWholesaleOffers([product({ type: "niche" })], mapWholesalePolicies(POLICY_ROWS.slice(0, 1)));
    expect(offers[0]).toMatchObject({ policy: null, wholesaleUnitPriceAmount: null, basePriceAmount: "130.00" });
  });

  it("floors the wholesale price at zero and does money in integer centavos", () => {
    const cheap = product({ variants: [variant("bottle", "30", "4.99")] });
    expect(buildWholesaleOffers([cheap], policies)[0]!.wholesaleUnitPriceAmount).toBe("0.00");
    const odd = product({ variants: [variant("bottle", "100", "100.10")] });
    expect(buildWholesaleOffers([odd], policies)[0]!.wholesaleUnitPriceAmount).toBe("95.10");
  });

  it("filters by commercial type and by brand/name text", () => {
    const offers = buildWholesaleOffers([
      product(),
      product({ type: "designer", brand: "Azzaro", name: "Wanted", slug: "wanted", productId: "p-2" }),
    ], policies);
    expect(filterWholesaleOffers(offers, "", "designer").map((offer) => offer.product.name)).toEqual(["Wanted"]);
    expect(filterWholesaleOffers(offers, "KHAM", "all").map((offer) => offer.product.name)).toEqual(["Khamrah"]);
  });
});
