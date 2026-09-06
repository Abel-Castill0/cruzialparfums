import { describe, expect, it } from "vitest";
import { LegacyCatalogRepository } from "./legacy-catalog-repository";

describe("LegacyCatalogRepository", () => {
  const repository = new LegacyCatalogRepository();

  it("keeps the deterministic legacy catalog contract", () => {
    expect(repository.getMetadata().counts).toEqual({
      total: 99,
      active: 96,
      discontinued: 3,
      arab: 69,
      designer: 23,
      niche: 4,
      combo: 3,
      duplicateIds: 0,
      bottlePrices: 23,
    });
    expect(repository.listFragrances()).toHaveLength(96);
  });

  it("does not promote legacy parity data to a future seed", () => {
    expect(repository.getMetadata().purpose).toBe("legacy_visual_parity_only");
    expect(repository.getMetadata().futureSeedEligible).toBe(false);
    expect(repository.list().every((product) => product.verificationStatus === "legacy"))
      .toBe(true);
  });
});
