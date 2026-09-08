import { describe, expect, it } from "vitest";
import {
  isValidUuid,
  slugify,
  validateInventoryForm,
  validateProductForm,
  validateVariantForm,
} from "./product-schema";

describe("slugify", () => {
  it("strips accents and normalizes to lowercase kebab-case", () => {
    expect(slugify("Khamrah Clásico")).toBe("khamrah-clasico");
    expect(slugify("  Gentleman Réserve Privée  ")).toBe("gentleman-reserve-privee");
  });

  it("collapses repeated separators and trims leading/trailing dashes", () => {
    expect(slugify("Amber -- Oud!!  Gold")).toBe("amber-oud-gold");
    expect(slugify("-leading and trailing-")).toBe("leading-and-trailing");
  });
});

describe("validateProductForm", () => {
  const validInput = {
    slug: "test-product",
    name: "Test Product",
    brand: "Test Brand",
    shortDescription: null,
    description: null,
    gender: null,
    concentration: null,
    salesMode: "always_available",
    productionStatus: "active",
    publicationStatus: "draft",
    isFeatured: false,
    featuredRank: null,
    featuredFrom: null,
    featuredUntil: null,
  };

  it("accepts a minimal valid submission", () => {
    const result = validateProductForm(validInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.slug).toBe("test-product");
      expect(result.value.name).toBe("Test Product");
    }
  });

  it("rejects an empty name", () => {
    const result = validateProductForm({ ...validInput, name: "  " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.name).toBeDefined();
  });

  it("rejects a slug with uppercase or spaces", () => {
    const result = validateProductForm({ ...validInput, slug: "Not A Slug" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.slug).toBeDefined();
  });

  it("rejects an invalid enum value instead of silently coercing it", () => {
    const result = validateProductForm({ ...validInput, salesMode: "made_up_mode" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.salesMode).toBeDefined();
  });

  it("rejects a featured rank when is_featured is false — mirrors products_featured_rank_check", () => {
    const result = validateProductForm({ ...validInput, isFeatured: false, featuredRank: 3 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.featuredRank).toBeDefined();
  });

  it("allows featured=true with no rank yet", () => {
    const result = validateProductForm({ ...validInput, isFeatured: true, featuredRank: null });
    expect(result.ok).toBe(true);
  });

  it("rejects featuredUntil at or before featuredFrom", () => {
    const result = validateProductForm({
      ...validInput,
      isFeatured: true,
      featuredFrom: "2026-01-10T00:00:00Z",
      featuredUntil: "2026-01-01T00:00:00Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.featuredUntil).toBeDefined();
  });

  it("accepts a valid featured window", () => {
    const result = validateProductForm({
      ...validInput,
      isFeatured: true,
      featuredRank: 0,
      featuredFrom: "2026-01-01T00:00:00Z",
      featuredUntil: "2026-01-10T00:00:00Z",
    });
    expect(result.ok).toBe(true);
  });
});

describe("validateVariantForm", () => {
  const validInput = {
    label: "3 ml",
    variantKind: "decant",
    sizeMl: 3,
    priceAmount: 12,
    currency: "PEN",
    sku: null,
    publicationStatus: "draft",
    sortOrder: 0,
  };

  it("accepts a valid decant variant", () => {
    const result = validateVariantForm(validInput);
    expect(result.ok).toBe(true);
  });

  it("accepts a two-decimal price affected by binary floating-point representation", () => {
    const result = validateVariantForm({ ...validInput, priceAmount: "19.90" });
    expect(result.ok).toBe(true);
  });

  it("rejects a negative price", () => {
    const result = validateVariantForm({ ...validInput, priceAmount: -1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.priceAmount).toBeDefined();
  });

  it("rejects a price with more than 2 decimals", () => {
    const result = validateVariantForm({ ...validInput, priceAmount: 12.999 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.priceAmount).toBeDefined();
  });

  it("rejects a non-numeric price", () => {
    const result = validateVariantForm({ ...validInput, priceAmount: "not a number" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.priceAmount).toBeDefined();
  });

  it("rejects a missing price rather than defaulting Number(null) to 0", () => {
    const nullPrice = validateVariantForm({ ...validInput, priceAmount: null });
    expect(nullPrice.ok).toBe(false);
    if (!nullPrice.ok) expect(nullPrice.errors.priceAmount).toBeDefined();

    const emptyPrice = validateVariantForm({ ...validInput, priceAmount: "" });
    expect(emptyPrice.ok).toBe(false);
    if (!emptyPrice.ok) expect(emptyPrice.errors.priceAmount).toBeDefined();
  });

  it("rejects an empty label", () => {
    const result = validateVariantForm({ ...validInput, label: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.label).toBeDefined();
  });

  it("rejects a currency that is not 3 letters", () => {
    const result = validateVariantForm({ ...validInput, currency: "S/" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.currency).toBeDefined();
  });
});

describe("validateInventoryForm", () => {
  it("accepts status_only with no quantity", () => {
    const result = validateInventoryForm({
      inventoryMode: "status_only",
      availabilityStatus: "available",
      quantityOnHand: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.quantityOnHand).toBeNull();
  });

  it("rejects status_only with a quantity — mirrors inventory_quantity_check", () => {
    const result = validateInventoryForm({
      inventoryMode: "status_only",
      availabilityStatus: "available",
      quantityOnHand: 10,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.quantityOnHand).toBeDefined();
  });

  it("requires a non-negative integer quantity for tracked_quantity", () => {
    const missing = validateInventoryForm({
      inventoryMode: "tracked_quantity",
      availabilityStatus: "available",
      quantityOnHand: null,
    });
    expect(missing.ok).toBe(false);

    const negative = validateInventoryForm({
      inventoryMode: "tracked_quantity",
      availabilityStatus: "available",
      quantityOnHand: -1,
    });
    expect(negative.ok).toBe(false);

    const valid = validateInventoryForm({
      inventoryMode: "tracked_quantity",
      availabilityStatus: "available",
      quantityOnHand: 25,
    });
    expect(valid.ok).toBe(true);
  });
});

describe("isValidUuid", () => {
  it("accepts a well-formed UUID", () => {
    expect(isValidUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
  });

  it("rejects a malformed value without querying the database", () => {
    expect(isValidUuid("not-a-uuid")).toBe(false);
    expect(isValidUuid("")).toBe(false);
    expect(isValidUuid(undefined)).toBe(false);
    expect(isValidUuid(123)).toBe(false);
  });
});
