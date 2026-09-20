import { describe, expect, it } from "vitest";
import { isBottleGiftEligible } from "./promotion-eligibility";

describe("bottle-only gift promotion eligibility", () => {
  it("is eligible only for the bottle group", () => {
    expect(isBottleGiftEligible("bottle")).toBe(true);
  });

  it("is not eligible for a decant, regardless of size", () => {
    expect(isBottleGiftEligible("decant")).toBe(false);
  });

  it("is not eligible when no variant is selected", () => {
    expect(isBottleGiftEligible(undefined)).toBe(false);
    expect(isBottleGiftEligible(null)).toBe(false);
  });
});
