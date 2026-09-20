import { describe, expect, it } from "vitest";
import {
  BUSINESS_UNITS,
  CAMPAIGN_STATUSES,
  CART_STORAGE_KEYS,
} from "./contracts";

describe("platform contracts", () => {
  it("keeps the two business units explicit", () => {
    expect(BUSINESS_UNITS.map((unit) => unit.code)).toEqual([
      "parfums",
      "import",
    ]);
  });

  it("never shares the cart persistence key", () => {
    expect(CART_STORAGE_KEYS.parfums).not.toBe(CART_STORAGE_KEYS.import);
  });

  it("contains only the confirmed campaign statuses", () => {
    expect(CAMPAIGN_STATUSES).toEqual([
      "draft",
      "scheduled",
      "open",
      "paused",
      "closed",
      "fulfilled",
    ]);
  });
});
