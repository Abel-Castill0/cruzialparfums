import { describe, expect, it } from "vitest";
import { LegacyCatalogRepository } from "../catalog/legacy-catalog-repository";
import {
  getWholesaleCategoryDiscount,
  isWholesalePolicyEligible,
  WHOLESALE_ELIGIBLE_LEGACY_IDS,
  WHOLESALE_MIN_QUANTITY,
  WHOLESALE_THRESHOLD_SCOPE,
} from "./wholesale-policy";

describe("wholesale policy (client-confirmed 2026-09-06)", () => {
  it("lists exactly the seven client-confirmed products", () => {
    expect(WHOLESALE_ELIGIBLE_LEGACY_IDS).toEqual([
      "9pm",
      "mandarin-sky",
      "khamrah-clasico",
      "khamrah-qahwa",
      "sublime",
      "yara-candy",
      "yara-pink",
    ]);
  });

  it("every eligible product actually exists and is a visible arab fragrance", () => {
    const repository = new LegacyCatalogRepository();
    for (const legacyId of WHOLESALE_ELIGIBLE_LEGACY_IDS) {
      const product = repository.findByLegacyId(legacyId);
      expect(product, `${legacyId} should exist`).not.toBeNull();
      expect(product?.type).toBe("arab");
    }
  });

  it("applies the confirmed per-category discount", () => {
    expect(getWholesaleCategoryDiscount("arab")).toBe(5);
    expect(getWholesaleCategoryDiscount("designer")).toBe(7);
    expect(getWholesaleCategoryDiscount("niche")).toBe(10);
    expect(getWholesaleCategoryDiscount("combo")).toBeUndefined();
  });

  it("keeps the 40-unit threshold scope unresolved rather than guessing", () => {
    expect(WHOLESALE_MIN_QUANTITY).toBe(40);
    expect(WHOLESALE_THRESHOLD_SCOPE).toBe("UNKNOWN");
  });

  it("isWholesalePolicyEligible matches the eligible list exactly", () => {
    expect(isWholesalePolicyEligible("9pm")).toBe(true);
    expect(isWholesalePolicyEligible("sauvage-edt")).toBe(false);
  });
});
