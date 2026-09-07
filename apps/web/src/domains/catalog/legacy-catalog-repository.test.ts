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
      designer: 24,
      niche: 3,
      combo: 3,
      duplicateIds: 0,
      bottlePrices: 23,
      hidden: 1,
    });
    // 96 active minus `bir-intense` (hidden: client does not carry it, see
    // docs/client-decisions.md) = 95 fragrances on public surfaces.
    expect(repository.listFragrances()).toHaveLength(95);
  });

  it("does not promote legacy parity data to a future seed", () => {
    expect(repository.getMetadata().purpose).toBe("legacy_visual_parity_only");
    expect(repository.getMetadata().futureSeedEligible).toBe(false);
    expect(repository.list().every((product) => product.verificationStatus === "legacy"))
      .toBe(true);
  });

  it("exposes exactly the three legacy combos without verifying their composition", () => {
    const combos = repository.listCombos();
    expect(combos.map((combo) => combo.name)).toEqual([
      "Cuarteto Oriental",
      "Vainilla Freak",
      "Set Tulum",
    ]);
    expect(combos.every((combo) =>
      combo.comboContent?.verificationStatus ===
        "client_provided_pending_reconfirmation"
    )).toBe(true);
  });

  it("does not surface hidden products anywhere public", () => {
    expect(repository.findBySlug("bir-intense")).toBeNull();
    expect(repository.findByLegacyId("bir-intense")).toBeNull();
    expect(repository.list().some((product) => product.legacyId === "bir-intense")).toBe(false);
    expect(repository.listWholesale().some((entry) => entry.product.legacyId === "bir-intense")).toBe(false);
  });

  it("joins all legacy wholesale tiers without promoting verification", () => {
    const wholesale = repository.listWholesale();

    // 93 legacy tiers minus `bir-intense` (hidden) = 92 visible entries.
    expect(wholesale).toHaveLength(92);
    expect(wholesale.every((entry) => entry.verificationStatus === "legacy")).toBe(true);
    expect(wholesale.find((entry) => entry.product.legacyId === "khamrah-clasico")?.prices)
      .toEqual({ unit: 130, m4: 122, m12: 114 });
  });

  it("listFeatured() is empty until real curation exists — never invents one", () => {
    // No product is marked isFeatured today (docs/client-decisions.md: no
    // client-confirmed curation). This is the honest, correct state, not a
    // bug — FeaturedPerfumeRail must render nothing when this is [].
    expect(repository.listFeatured()).toEqual([]);
  });
});
