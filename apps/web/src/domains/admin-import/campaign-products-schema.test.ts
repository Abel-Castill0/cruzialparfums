import { describe, expect, it } from "vitest";
import { isCampaignProductAvailability, validateCampaignProductItems } from "./campaign-products-schema";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const VARIANT_ID = "22222222-2222-4222-8222-222222222222";

describe("validateCampaignProductItems", () => {
  it("normalizes a valid minimal item (no variant)", () => {
    const result = validateCampaignProductItems([
      { productId: PRODUCT_ID, priceAmount: "45.5", sortOrder: 0 },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([
        {
          productId: PRODUCT_ID,
          productVariantId: null,
          priceAmount: 45.5,
          availabilityStatus: "available",
          quantityLimit: null,
          sortOrder: 0,
        },
      ]);
    }
  });

  it("accepts a variant, availability and quantity limit", () => {
    const result = validateCampaignProductItems([
      {
        productId: PRODUCT_ID,
        productVariantId: VARIANT_ID,
        priceAmount: 30,
        availabilityStatus: "out_of_stock",
        quantityLimit: "2",
        sortOrder: 1,
      },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]).toMatchObject({
        productVariantId: VARIANT_ID,
        availabilityStatus: "out_of_stock",
        quantityLimit: 2,
      });
    }
  });

  it("rejects a non-array payload", () => {
    const result = validateCampaignProductItems({ not: "an array" });
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid productId", () => {
    const result = validateCampaignProductItems([{ productId: "not-a-uuid", priceAmount: 10, sortOrder: 0 }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors["items.0.productId"]).toBeTruthy();
  });

  it("rejects a duplicate product+variant pair", () => {
    const result = validateCampaignProductItems([
      { productId: PRODUCT_ID, priceAmount: 10, sortOrder: 0 },
      { productId: PRODUCT_ID, priceAmount: 20, sortOrder: 1 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors["items.1.productId"]).toBeTruthy();
  });

  it("allows the same product with two different variants", () => {
    const result = validateCampaignProductItems([
      { productId: PRODUCT_ID, productVariantId: VARIANT_ID, priceAmount: 10, sortOrder: 0 },
      { productId: PRODUCT_ID, priceAmount: 20, sortOrder: 1 },
    ]);
    expect(result.ok).toBe(true);
  });

  it("rejects a missing or negative price", () => {
    expect(validateCampaignProductItems([{ productId: PRODUCT_ID, sortOrder: 0 }]).ok).toBe(false);
    expect(validateCampaignProductItems([{ productId: PRODUCT_ID, priceAmount: -1, sortOrder: 0 }]).ok).toBe(false);
  });

  it("rejects a quantityLimit that is not a positive integer", () => {
    const result = validateCampaignProductItems([
      { productId: PRODUCT_ID, priceAmount: 10, quantityLimit: 0, sortOrder: 0 },
    ]);
    expect(result.ok).toBe(false);
  });

  it("defaults an unrecognized availabilityStatus to 'available'", () => {
    const result = validateCampaignProductItems([
      { productId: PRODUCT_ID, priceAmount: 10, availabilityStatus: "on_backorder", sortOrder: 0 },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0]?.availabilityStatus).toBe("available");
  });

  it("rejects more than the max item count", () => {
    const items = Array.from({ length: 501 }, (_, index) => ({
      productId: PRODUCT_ID,
      productVariantId: `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`,
      priceAmount: 10,
      sortOrder: index,
    }));
    const result = validateCampaignProductItems(items);
    expect(result.ok).toBe(false);
  });
});

describe("isCampaignProductAvailability", () => {
  it("accepts the confirmed statuses only", () => {
    expect(isCampaignProductAvailability("available")).toBe(true);
    expect(isCampaignProductAvailability("out_of_stock")).toBe(true);
    expect(isCampaignProductAvailability("backordered")).toBe(false);
  });
});
