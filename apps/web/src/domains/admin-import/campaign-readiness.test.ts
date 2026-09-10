import { describe, expect, it } from "vitest";
import { classifyOfferReadiness, type CampaignReadinessInput } from "./campaign-readiness";

const base: CampaignReadinessInput = {
  campaignStatus: "open",
  campaignArchivedAt: null,
  productPublicationStatus: "published",
  productArchivedAt: null,
  productVariantId: null,
  variantPublicationStatus: null,
  variantArchivedAt: null,
  availabilityStatus: "available",
};

describe("classifyOfferReadiness", () => {
  it("is visible when every RLS gate passes (product-level offer)", () => {
    const result = classifyOfferReadiness(base);
    expect(result).toEqual({
      isPubliclyVisible: true,
      visibilityReason: "visible",
      availability: "available",
    });
  });

  it("visibility and availability are independent: an out_of_stock offer is still publicly visible", () => {
    const result = classifyOfferReadiness({ ...base, availabilityStatus: "out_of_stock" });
    expect(result.isPubliclyVisible).toBe(true);
    expect(result.visibilityReason).toBe("visible");
    expect(result.availability).toBe("out_of_stock");
  });

  it("a published, visible variant offer is visible", () => {
    const result = classifyOfferReadiness({
      ...base,
      productVariantId: "variant-id",
      variantPublicationStatus: "published",
      variantArchivedAt: null,
    });
    expect(result).toEqual({ isPubliclyVisible: true, visibilityReason: "visible", availability: "available" });
  });

  describe("campaign gates (checked first, like campaign_is_public)", () => {
    it("campaign_archived wins even if the product/variant would otherwise be visible", () => {
      const result = classifyOfferReadiness({ ...base, campaignArchivedAt: "2026-01-01T00:00:00Z" });
      expect(result.isPubliclyVisible).toBe(false);
      expect(result.visibilityReason).toBe("campaign_archived");
    });

    it("campaign_not_open for any non-open status", () => {
      for (const status of ["draft", "scheduled", "paused", "closed", "fulfilled"]) {
        const result = classifyOfferReadiness({ ...base, campaignStatus: status });
        expect(result.visibilityReason).toBe("campaign_not_open");
        expect(result.isPubliclyVisible).toBe(false);
      }
    });

    it("archived_at takes priority over a non-open status", () => {
      const result = classifyOfferReadiness({
        ...base,
        campaignStatus: "closed",
        campaignArchivedAt: "2026-01-01T00:00:00Z",
      });
      expect(result.visibilityReason).toBe("campaign_archived");
    });
  });

  describe("product gates (checked after campaign, like product_is_public)", () => {
    it("product_archived (archived_at set) wins over publication_status", () => {
      const result = classifyOfferReadiness({
        ...base,
        productPublicationStatus: "published",
        productArchivedAt: "2026-01-01T00:00:00Z",
      });
      expect(result.visibilityReason).toBe("product_archived");
    });

    it("product_draft", () => {
      const result = classifyOfferReadiness({ ...base, productPublicationStatus: "draft" });
      expect(result.visibilityReason).toBe("product_draft");
    });

    it("product_hidden for publication_status hidden", () => {
      const result = classifyOfferReadiness({ ...base, productPublicationStatus: "hidden", productArchivedAt: null });
      expect(result.visibilityReason).toBe("product_hidden");
    });

    it("product_archived for publication_status archived even when archived_at is null", () => {
      const result = classifyOfferReadiness({ ...base, productPublicationStatus: "archived", productArchivedAt: null });
      expect(result.visibilityReason).toBe("product_archived");
    });

    it("fails closed for an unknown runtime product status", () => {
      const malformed = { ...base, productPublicationStatus: "unexpected" } as unknown as CampaignReadinessInput;
      const result = classifyOfferReadiness(malformed);
      expect(result.isPubliclyVisible).toBe(false);
      expect(result.visibilityReason).toBe("unknown_publication_status");
    });

    it("a blocked campaign gate is reported before any product gate is even evaluated", () => {
      const result = classifyOfferReadiness({
        ...base,
        campaignStatus: "draft",
        productPublicationStatus: "draft",
      });
      expect(result.visibilityReason).toBe("campaign_not_open");
    });
  });

  describe("variant gates (only evaluated when a variant is present, after product passes)", () => {
    it("variant_archived", () => {
      const result = classifyOfferReadiness({
        ...base,
        productVariantId: "variant-id",
        variantPublicationStatus: "published",
        variantArchivedAt: "2026-01-01T00:00:00Z",
      });
      expect(result.visibilityReason).toBe("variant_archived");
    });

    it("variant_not_published for draft publication_status", () => {
      const result = classifyOfferReadiness({ ...base, productVariantId: "variant-id", variantPublicationStatus: "draft" });
      expect(result.visibilityReason).toBe("variant_not_published");
    });

    it("variant_archived for archived publication_status", () => {
      const result = classifyOfferReadiness({ ...base, productVariantId: "variant-id", variantPublicationStatus: "archived" });
      expect(result.visibilityReason).toBe("variant_archived");
    });

    it("fails closed for an unknown runtime variant status", () => {
      const malformed = {
        ...base,
        productVariantId: "variant-id",
        variantPublicationStatus: "unexpected",
      } as unknown as CampaignReadinessInput;
      const result = classifyOfferReadiness(malformed);
      expect(result.isPubliclyVisible).toBe(false);
      expect(result.visibilityReason).toBe("unknown_publication_status");
    });

    it("a product-level block is reported before any variant gate is evaluated", () => {
      const result = classifyOfferReadiness({
        ...base,
        productPublicationStatus: "draft",
        productVariantId: "variant-id",
        variantPublicationStatus: "published",
      });
      expect(result.visibilityReason).toBe("product_draft");
    });

    it("no variant on the offer (variantPublicationStatus null) skips variant gates entirely", () => {
      const result = classifyOfferReadiness({ ...base, productVariantId: null, variantPublicationStatus: null, variantArchivedAt: "2026-01-01T00:00:00Z" });
      expect(result.visibilityReason).toBe("visible");
    });
  });
});
