import { describe, expect, it } from "vitest";
import {
  formatCentsAsSoles,
  mixedWholesaleRulePayload,
  readMixedWholesaleRule,
  parseShippingCostToCents,
  validateDeliveryZoneForm,
  validateGiftExclusionIds,
  validateMixedWholesaleForm,
  validateShippingAgencyForm,
} from "./rule-forms";

describe("delivery zone form", () => {
  it("trims the district and keeps the restriction flag strict", () => {
    expect(validateDeliveryZoneForm({ district: "  Santa   Anita ", isRestricted: true })).toEqual({ ok: true, value: { district: "Santa Anita", isRestricted: true } });
    expect(validateDeliveryZoneForm({ district: "Ate", isRestricted: "on" })).toEqual({ ok: true, value: { district: "Ate", isRestricted: false } });
  });
  it("rejects an empty or oversized district", () => {
    expect(validateDeliveryZoneForm({ district: " ", isRestricted: false }).ok).toBe(false);
    expect(validateDeliveryZoneForm({ district: "x".repeat(81), isRestricted: false }).ok).toBe(false);
  });
});

describe("shipping agency form", () => {
  it("accepts Shalom as the owner defined it", () => {
    expect(validateShippingAgencyForm({ name: "Shalom", coverage: "Todo Perú", description: "Cotización por WhatsApp", isActive: true })).toEqual({
      ok: true,
      value: { name: "Shalom", coverage: "Todo Perú", description: "Cotización por WhatsApp", isActive: true },
    });
  });
  it("needs a name and a coverage", () => {
    const result = validateShippingAgencyForm({ name: "", coverage: "", description: "", isActive: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["coverage", "name"]);
  });
});

describe("mixed wholesale form", () => {
  const valid = { minUnits: "40", arabic: "5", designer: "7", niche: "10", isActive: true };
  it("builds the confirmed rule: 40 bottles, S/5, S/7 and S/10, nothing above", () => {
    const result = validateMixedWholesaleForm(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mixedWholesaleRulePayload(result.value)).toEqual({
      conditions: { min_units: 40, count: "bottles" },
      actions: { discount_per_unit: { arabic: 5, designer: 7, niche: 10 }, currency: "PEN" },
    });
  });
  it.each([
    ["no threshold", { ...valid, minUnits: "" }],
    ["zero threshold", { ...valid, minUnits: "0" }],
    ["decimal threshold", { ...valid, minUnits: "4.5" }],
    ["zero discount", { ...valid, designer: "0" }],
    ["negative discount", { ...valid, niche: "-1" }],
    ["too many decimals", { ...valid, arabic: "5.123" }],
    ["absurd discount", { ...valid, arabic: "5000" }],
  ])("rejects %s", (_name, input) => {
    expect(validateMixedWholesaleForm(input).ok).toBe(false);
  });
});

describe("reading the stored mixed rule", () => {
  const row = { id: "r1", updated_at: "2026-10-14T00:00:00Z", is_active: true, conditions: { min_units: 40, count: "bottles" }, actions: { discount_per_unit: { arabic: 5, designer: 7, niche: 10 }, currency: "PEN" } };
  it("reads a well-formed row", () => {
    expect(readMixedWholesaleRule(row)).toEqual({ id: "r1", updatedAt: "2026-10-14T00:00:00Z", minUnits: 40, discounts: { arabic: 5, designer: 7, niche: 10 }, isActive: true });
  });
  it("treats a missing or malformed row as absent instead of inventing numbers", () => {
    expect(readMixedWholesaleRule(null)).toBeNull();
    expect(readMixedWholesaleRule({ ...row, conditions: {} })).toBeNull();
    expect(readMixedWholesaleRule({ ...row, conditions: { min_units: 4.5 } })).toBeNull();
    expect(readMixedWholesaleRule({ ...row, actions: { discount_per_unit: { arabic: 5, designer: 7 } } })).toBeNull();
    expect(readMixedWholesaleRule({ ...row, actions: {} })).toBeNull();
  });
});

describe("gift exclusion ids", () => {
  const a = "b6000000-0000-4000-8000-000000000001";
  it("deduplicates and normalizes", () => {
    expect(validateGiftExclusionIds([a, a.toUpperCase(), ` ${a} `])).toEqual({ ok: true, value: [a] });
  });
  it("rejects anything that is not a product id", () => {
    expect(validateGiftExclusionIds([a, "club-de-nuit"]).ok).toBe(false);
    expect(validateGiftExclusionIds(Array.from({ length: 51 }, (_, i) => `b6000000-0000-4000-8000-${String(i).padStart(12, "0")}`)).ok).toBe(false);
  });
  it("treats a missing list as empty", () => {
    expect(validateGiftExclusionIds(undefined)).toEqual({ ok: true, value: [] });
  });
});

describe("shipping cost", () => {
  it.each([
    ["15", 1500],
    ["15.5", 1550],
    ["15,50", 1550],
    ["0", 0],
    [" 0.05 ", 5],
  ])("turns %s soles into cents", (input, cents) => {
    expect(parseShippingCostToCents(input)).toEqual({ ok: true, value: cents });
  });
  it("clears the cost when empty", () => {
    expect(parseShippingCostToCents("  ")).toEqual({ ok: true, value: null });
  });
  it.each(["-1", "abc", "1.234", "1e3", "9999999"])("rejects %s", (input) => {
    expect(parseShippingCostToCents(input).ok).toBe(false);
  });
  it("formats cents back to soles", () => {
    expect(formatCentsAsSoles(1550)).toBe("S/ 15.50");
  });
});
