import { describe, expect, it } from "vitest";
import { LegacyCatalogRepository } from "../catalog/legacy-catalog-repository";
import {
  calculateComboTotal,
  canSendCombo,
  filterComboProducts,
  listComboEligibleProducts,
  resolveComboSelection,
} from "./combo-builder";

describe("custom combo rules", () => {
  const eligible = listComboEligibleProducts(new LegacyCatalogRepository().list());

  it("offers active fragrances only", () => {
    expect(eligible).toHaveLength(93);
    expect(eligible.some((product) => product.type === "combo" || product.discontinued)).toBe(false);
  });

  it("searches brand, name and family", () => {
    expect(filterComboProducts(eligible, "khamrah")).toHaveLength(4);
    expect(filterComboProducts(eligible, "gourmand").length).toBeGreaterThan(0);
  });

  it("uses catalog prices and enforces the legacy 3–6 range", () => {
    const selected = resolveComboSelection(eligible, [
      "khamrah-clasico",
      "khamrah-qahwa",
      "khamrah-dukhan",
    ]);
    expect(calculateComboTotal(selected, 3)).toBe(36);
    expect(calculateComboTotal(selected, 5)).toBe(48);
    expect(canSendCombo(2)).toBe(false);
    expect(canSendCombo(3)).toBe(true);
    expect(canSendCombo(6)).toBe(true);
    expect(canSendCombo(7)).toBe(false);
  });
});
