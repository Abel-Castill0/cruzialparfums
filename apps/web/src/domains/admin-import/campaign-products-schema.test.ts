import { describe, expect, it } from "vitest";
import {
  isCampaignProductAvailability,
  isValidMoneyText,
  normalizeMoneyText,
  validateCampaignProductItems,
} from "./campaign-products-schema";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const VARIANT_ID = "22222222-2222-4222-8222-222222222222";

describe("validateCampaignProductItems", () => {
  it("normalizes a valid minimal item (no variant)", () => {
    const result = validateCampaignProductItems([
      { productId: PRODUCT_ID, priceAmount: "45.5", availabilityStatus: "available", sortOrder: 0 },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([
        {
          productId: PRODUCT_ID,
          productVariantId: null,
          importPresentationId: null,
          priceAmount: "45.50",
          availabilityStatus: "available",
          sortOrder: 0,
        },
      ]);
    }
  });

  it("accepts a variant and availability", () => {
    const result = validateCampaignProductItems([
      {
        productId: PRODUCT_ID,
        productVariantId: VARIANT_ID,
        priceAmount: "30",
        availabilityStatus: "out_of_stock",
        sortOrder: 1,
      },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]).toMatchObject({
        productVariantId: VARIANT_ID,
        priceAmount: "30.00",
        availabilityStatus: "out_of_stock",
      });
    }
  });

  it("never accepts quantityLimit as client input (not part of the write contract)", () => {
    const result = validateCampaignProductItems([
      { productId: PRODUCT_ID, priceAmount: "10", availabilityStatus: "available", quantityLimit: 7, sortOrder: 0 },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]).not.toHaveProperty("quantityLimit");
    }
  });

  it("rejects a non-array payload", () => {
    const result = validateCampaignProductItems({ not: "an array" });
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid productId", () => {
    const result = validateCampaignProductItems([
      { productId: "not-a-uuid", priceAmount: "10", availabilityStatus: "available", sortOrder: 0 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors["items.0.productId"]).toBeTruthy();
  });

  it("rejects a duplicate product+variant pair", () => {
    const result = validateCampaignProductItems([
      { productId: PRODUCT_ID, priceAmount: "10", availabilityStatus: "available", sortOrder: 0 },
      { productId: PRODUCT_ID, priceAmount: "20", availabilityStatus: "available", sortOrder: 1 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors["items.1.productId"]).toBeTruthy();
  });

  it("allows the same product with two different variants", () => {
    const result = validateCampaignProductItems([
      { productId: PRODUCT_ID, productVariantId: VARIANT_ID, priceAmount: "10", availabilityStatus: "available", sortOrder: 0 },
      { productId: PRODUCT_ID, priceAmount: "20", availabilityStatus: "available", sortOrder: 1 },
    ]);
    expect(result.ok).toBe(true);
  });

  it("rejects more than the max item count", () => {
    const items = Array.from({ length: 1501 }, (_, index) => ({
      productId: PRODUCT_ID,
      productVariantId: `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`,
      priceAmount: "10",
      availabilityStatus: "available",
      sortOrder: index,
    }));
    const result = validateCampaignProductItems(items);
    expect(result.ok).toBe(false);
  });

  describe("availability — fail closed (4J2 correction)", () => {
    it("rejects a missing availabilityStatus instead of defaulting to available", () => {
      const result = validateCampaignProductItems([
        { productId: PRODUCT_ID, priceAmount: "10", sortOrder: 0 },
      ]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors["items.0.availabilityStatus"]).toBeTruthy();
    });

    it("rejects an unrecognized availabilityStatus instead of defaulting to available", () => {
      const result = validateCampaignProductItems([
        { productId: PRODUCT_ID, priceAmount: "10", availabilityStatus: "on_backorder", sortOrder: 0 },
      ]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors["items.0.availabilityStatus"]).toBeTruthy();
    });

    it("rejects null availabilityStatus", () => {
      const result = validateCampaignProductItems([
        { productId: PRODUCT_ID, priceAmount: "10", availabilityStatus: null, sortOrder: 0 },
      ]);
      expect(result.ok).toBe(false);
    });
  });

  describe("exact decimal money", () => {
    const accepted: [string, string][] = [
      ["0", "0.00"],
      ["0.01", "0.01"],
      ["16", "16.00"],
      ["16.5", "16.50"],
      ["16.50", "16.50"],
      ["9999999999.99", "9999999999.99"],
    ];

    it.each(accepted)("accepts and normalizes %s -> %s", (input, normalized) => {
      const result = validateCampaignProductItems([
        { productId: PRODUCT_ID, priceAmount: input, availabilityStatus: "available", sortOrder: 0 },
      ]);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value[0]?.priceAmount).toBe(normalized);
    });

    const rejected: [string, unknown][] = [
      ["NaN string", "NaN"],
      ["Infinity string", "Infinity"],
      ["negative", "-1"],
      ["negative zero", "-0"],
      ["more than 2 decimals", "16.555"],
      ["malformed — letters", "abc"],
      ["malformed — thousands separator", "1,000.00"],
      ["malformed — trailing dot", "16."],
      ["malformed — empty", ""],
      ["scientific notation", "1e3"],
      ["out of range — too many integer digits", "99999999999.99"],
      ["JS number NaN (not a canonical decimal string)", NaN],
      ["JS number Infinity (not a canonical decimal string)", Infinity],
      ["a plain JS number is no longer accepted at all", 16],
    ];

    it.each(rejected)("rejects %s", (_label, input) => {
      const result = validateCampaignProductItems([
        { productId: PRODUCT_ID, priceAmount: input, availabilityStatus: "available", sortOrder: 0 },
      ]);
      expect(result.ok).toBe(false);
    });
  });
});

describe("campaign offer scale", () => {
  it("accepts 913 valid offers (Sexto Consolidado scale)", () => {
    const items = Array.from({ length: 913 }, (_, index) => ({
      productId: PRODUCT_ID,
      importPresentationId: `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`,
      priceAmount: "10.00",
      availabilityStatus: "available" as const,
      sortOrder: index,
    }));
    const result = validateCampaignProductItems(items);
    expect(result.ok).toBe(true);
  });

  it("accepts exactly MAX_CAMPAIGN_OFFERS (1500) offers", () => {
    const items = Array.from({ length: 1500 }, (_, index) => ({
      productId: PRODUCT_ID,
      importPresentationId: `44444444-4444-4444-8444-${String(index).padStart(12, "0")}`,
      priceAmount: "10.00",
      availabilityStatus: "available" as const,
      sortOrder: index,
    }));
    const result = validateCampaignProductItems(items);
    expect(result.ok).toBe(true);
  });

  it("rejects MAX_CAMPAIGN_OFFERS + 1 (1501) offers", () => {
    const items = Array.from({ length: 1501 }, (_, index) => ({
      productId: PRODUCT_ID,
      importPresentationId: `55555555-5555-5555-8555-${String(index).padStart(12, "0")}`,
      priceAmount: "10.00",
      availabilityStatus: "available" as const,
      sortOrder: index,
    }));
    const result = validateCampaignProductItems(items);
    expect(result.ok).toBe(false);
  });
});

describe("isCampaignProductAvailability", () => {
  it("accepts the confirmed statuses only", () => {
    expect(isCampaignProductAvailability("unconfirmed")).toBe(true);
    expect(isCampaignProductAvailability("available")).toBe(true);
    expect(isCampaignProductAvailability("out_of_stock")).toBe(true);
    expect(isCampaignProductAvailability("backordered")).toBe(false);
    expect(isCampaignProductAvailability(null)).toBe(false);
    expect(isCampaignProductAvailability(undefined)).toBe(false);
  });
});

describe("money text helpers", () => {
  it("isValidMoneyText matches the same syntax rules used inline", () => {
    expect(isValidMoneyText("16.50")).toBe(true);
    expect(isValidMoneyText("16.555")).toBe(false);
    expect(isValidMoneyText(-16)).toBe(false);
    expect(isValidMoneyText("-16")).toBe(false);
  });

  it("normalizeMoneyText pads via string ops only, never Number()", () => {
    expect(normalizeMoneyText("16")).toBe("16.00");
    expect(normalizeMoneyText("16.5")).toBe("16.50");
    expect(normalizeMoneyText("9999999999.99")).toBe("9999999999.99");
  });
});
