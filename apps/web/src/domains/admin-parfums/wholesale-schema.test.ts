import { describe, expect, it } from "vitest";
import { isWholesaleCommercialType, validateWholesalePolicyForm } from "./wholesale-schema";

describe("validateWholesalePolicyForm", () => {
  it("normalizes confirmed-style policy input without float arithmetic", () => {
    expect(validateWholesalePolicyForm({ minQuantity: "40", discountAmount: "5", isActive: "on" })).toEqual({
      ok: true,
      value: { minQuantity: 40, discountAmount: "5.00", isActive: true },
    });
  });

  it.each([
    [{ minQuantity: "0", discountAmount: "5" }, "minQuantity"],
    [{ minQuantity: "40.5", discountAmount: "5" }, "minQuantity"],
    [{ minQuantity: "40", discountAmount: "0" }, "discountAmount"],
    [{ minQuantity: "40", discountAmount: "5.001" }, "discountAmount"],
    [{ minQuantity: "40", discountAmount: "not-money" }, "discountAmount"],
  ])("rejects invalid policy input %#", (input, field) => {
    const result = validateWholesalePolicyForm(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[field]).toBeTruthy();
  });

  it("accepts only the stable commercial type identities", () => {
    expect(isWholesaleCommercialType("arabic")).toBe(true);
    expect(isWholesaleCommercialType("designer")).toBe(true);
    expect(isWholesaleCommercialType("niche")).toBe(true);
    expect(isWholesaleCommercialType("Árabe")).toBe(false);
  });
});
