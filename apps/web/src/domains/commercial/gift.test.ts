import { describe, expect, it } from "vitest";
import { LegacyCatalogRepository } from "../catalog/legacy-catalog-repository";
import type { CatalogProduct } from "../catalog/types";
import { checkGiftSelection, hasFullBottle } from "./gift";

const products = new LegacyCatalogRepository().list();
const arabic = { ...products.find((item) => item.type === "arab" && item.availabilityStatus === "available")!, productId: "aaaaaaaa-0000-4000-8000-000000000001" };
const designer = { ...products.find((item) => item.type === "designer")!, productId: "aaaaaaaa-0000-4000-8000-000000000002" };
const combo = products.find((item) => item.type === "combo");

const check = (overrides: Partial<Parameters<typeof checkGiftSelection>[0]> = {}) =>
  checkGiftSelection({ giftProduct: arabic, fullBottleInOrder: true, excludedProductIds: [], ...overrides });

describe("2 ml gift selection", () => {
  it("accepts a purchasable Arabic perfume when the order has a full bottle", () => {
    expect(check()).toEqual({ ok: true, productId: arabic.productId });
  });

  it("needs a full bottle in the order", () => {
    expect(check({ fullBottleInOrder: false })).toMatchObject({ ok: false, problem: "no_full_bottle" });
  });

  it("only Arabic perfumes can be the gift", () => {
    expect(check({ giftProduct: designer })).toMatchObject({ ok: false, problem: "not_arabic" });
    if (combo) expect(check({ giftProduct: { ...combo, productId: "aaaaaaaa-0000-4000-8000-000000000003" } })).toMatchObject({ ok: false, problem: "not_arabic" });
  });

  it("refuses an excluded perfume by id", () => {
    expect(check({ excludedProductIds: [arabic.productId!] })).toMatchObject({ ok: false, problem: "excluded" });
    expect(check({ excludedProductIds: ["aaaaaaaa-0000-4000-8000-0000000000ff"] }).ok).toBe(true);
  });

  it("refuses an unknown, out-of-stock or fixture-only perfume", () => {
    expect(check({ giftProduct: null })).toMatchObject({ ok: false, problem: "unknown_product" });
    expect(check({ giftProduct: { ...arabic, availabilityStatus: "out_of_stock" } as CatalogProduct })).toMatchObject({ ok: false, problem: "unavailable" });
    expect(check({ giftProduct: { ...arabic, productId: null } })).toMatchObject({ ok: false, problem: "unavailable" });
  });

  it("counts only full bottles of single perfumes, never decants or sets", () => {
    expect(hasFullBottle([{ product: arabic, group: "decant" }])).toBe(false);
    expect(hasFullBottle([{ product: arabic, group: "decant" }, { product: designer, group: "bottle" }])).toBe(true);
    if (combo) expect(hasFullBottle([{ product: combo, group: "bottle" }])).toBe(false);
  });
});
