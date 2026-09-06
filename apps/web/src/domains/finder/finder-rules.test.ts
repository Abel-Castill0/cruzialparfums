import { describe, expect, it } from "vitest";
import { LegacyCatalogRepository } from "../catalog/legacy-catalog-repository";
import {
  findPerfumes,
  finderConfidence,
  listFinderFamilies,
  listFinderProducts,
  listFinderTopNotes,
  type FinderAnswers,
} from "./finder-rules";

describe("deterministic perfume finder", () => {
  const products = new LegacyCatalogRepository().list();
  const answers: FinderAnswers = {
    forWhom: "mi",
    feelings: ["dulce", "calido"],
    families: ["Gourmand"],
    intensity: 2,
    notes: ["Vainilla", "Canela"],
  };

  it("derives its option universe from the active catalog", () => {
    // 95 visible fragrances (96 active minus hidden `bir-intense`) minus the
    // 3 discontinued = 92 candidates for the Finder.
    expect(listFinderProducts(products)).toHaveLength(92);
    expect(listFinderFamilies(products)).toEqual([
      "Fresco", "Acuático", "Cítrico", "Floral", "Gourmand", "Ámbar", "Amaderado", "Especiado",
    ]);
    expect(listFinderTopNotes(products)).toHaveLength(16);
  });

  it("ranks from real fields plus documented family heuristics", () => {
    const results = findPerfumes(products, answers);
    expect(results).toHaveLength(4);
    expect(results[0]!.product.legacyId).toBe("khamrah-clasico");
    expect(results[0]!.score).toBeGreaterThanOrEqual(results[1]!.score);
    expect(results[0]!.reasons.direct).toContain("familia gourmand");
    expect(finderConfidence(results)).toMatch(/clear|close/);
  });

  it("reports weak matches instead of claiming perfection", () => {
    const results = findPerfumes(products, {
      forWhom: "mi",
      feelings: ["fresco"],
      families: ["Ámbar"],
      intensity: 1,
      notes: ["Café", "Cereza", "Menta", "Pistacho"],
    });
    expect(finderConfidence(results)).toBe("weak");
  });
});
