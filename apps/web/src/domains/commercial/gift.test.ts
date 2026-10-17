import { describe, expect, it } from "vitest";
import { isProductPurchasable } from "../catalog/availability";
import { LegacyCatalogRepository } from "../catalog/legacy-catalog-repository";
import type { CatalogProduct } from "../catalog/types";
import { checkGiftSelection, hasFullBottle, listGiftCandidates } from "./gift";

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

describe("2 ml gift candidates (what the checkout selector may offer)", () => {
  const withIds = products.map((product, index) => ({ ...product, productId: `cand-${String(index).padStart(4, "0")}` }));

  it("offers only purchasable Arabic perfumes that have a database id", () => {
    const candidates = listGiftCandidates(withIds);
    const expected = withIds.filter((product) => product.type === "arab" && isProductPurchasable(product));
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.map((candidate) => candidate.productId).sort()).toEqual(expected.map((product) => product.productId).sort());
    for (const candidate of candidates) expect(Object.keys(candidate).sort()).toEqual(["brand", "name", "productId"]);
  });

  it("sorts by brand and name so the list is stable regardless of catalog order", () => {
    const candidates = listGiftCandidates(withIds);
    const sorted = [...candidates].sort((a, b) => `${a.brand} ${a.name}`.localeCompare(`${b.brand} ${b.name}`, "es"));
    expect(candidates).toEqual(sorted);
  });

  it("removes the excluded ids the active rule names", () => {
    const [first] = listGiftCandidates(withIds);
    const excluded = listGiftCandidates(withIds, [first!.productId]);
    expect(excluded.some((candidate) => candidate.productId === first!.productId)).toBe(false);
    expect(excluded).toHaveLength(listGiftCandidates(withIds).length - 1);
  });

  it("offers nothing when perfumes have no database id (legacy fixtures) or are all excluded", () => {
    expect(listGiftCandidates(products)).toEqual([]);
    expect(listGiftCandidates(withIds, withIds.filter((product) => product.type === "arab").map((product) => product.productId))).toEqual([]);
  });
});
