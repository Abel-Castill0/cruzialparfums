import { describe, expect, it } from "vitest";

import {
  normalizeMediaIdentity,
  reconcileClientMedia,
  serializeReconciliationArtifact,
  sortReconciliationRecords,
  type LegacyMediaProduct,
  type ReconciliationRecord,
} from "../../../../../scripts/client-media-reconciliation.mjs";

const baseProduct: LegacyMediaProduct = {
  id: "khamrah-clasico",
  name: "Khamrah Clásico",
  brand: "Lattafa",
  type: "arab",
  img: "img/perfumes/webp/LATTAFA - KHAMRAH CLASICO (2).webp",
  imgBottle: "img/perfumes/webp/LATTAFA - KHAMRAH CLASICO.webp",
  imgSet: "img/perfumes/webp/LATTAFA - KHAMRAH CLASICO (2).webp",
};

describe("client media reconciliation", () => {
  it("normalizes case, accents, separators, punctuation, and whitespace", () => {
    expect(normalizeMediaIdentity("  Armani—Réserve__Privée (2).PNG ")).toBe(
      "armani reserve privee 2",
    );
    expect(
      normalizeMediaIdentity("AZZARO.-AZZARO THE MOSTH WANTED INTENSE EDP.png"),
    ).toBe("azzaro azzaro the mosth wanted intense edp");
  });

  it("confirms an exact normalized catalog identity", () => {
    const result = reconcileClientMedia({
      products: [{ ...baseProduct, img: null, imgBottle: null, imgSet: null }],
      clientFilenames: ["LATTAFA - KHAMRAH CLASICO.png"],
    });

    expect(result.records[0]).toMatchObject({
      legacy_product_id: "khamrah-clasico",
      status: "EXACT_MATCH",
      match_basis: "NORMALIZED_CATALOG_IDENTITY",
    });
  });

  it("confirms an alias only through the current IMG_MAP-derived path", () => {
    const result = reconcileClientMedia({
      products: [
        {
          id: "reserve-privee",
          name: "Gentleman Réserve Privée",
          brand: "Givenchy",
          type: "designer",
          img: "img/perfumes/webp/Armani Reserve Privée (2).webp",
          imgBottle: "img/perfumes/webp/Armani Reserve Privée.webp",
          imgSet: "img/perfumes/webp/Armani Reserve Privée (2).webp",
        },
      ],
      clientFilenames: ["Armani Reserve Privée.png"],
    });

    expect(result.records[0]).toMatchObject({
      legacy_product_id: "reserve-privee",
      status: "ALIAS_CONFIRMED",
      match_basis: "CURRENT_IMG_MAP",
    });
  });

  it("honors the documented Valentino alias and its deterministic (2) pair", () => {
    const result = reconcileClientMedia({
      products: [
        {
          id: "purple-melancholia",
          name: "Purple Melancholia",
          brand: "Valentino",
          type: "designer",
          img: "img/perfumes/webp/Purple Melancholia (2).webp",
          imgBottle: "img/perfumes/webp/Purple Melancholia.webp",
          imgSet: "img/perfumes/webp/Purple Melancholia (2).webp",
        },
      ],
      clientFilenames: [
        "VALENTINO - VALENTINO MELANCHOLIA.png",
        "VALENTINO - VALENTINO MELANCHOLIA (2).png",
      ],
    });

    expect(result.records).toEqual([
      expect.objectContaining({
        legacy_product_id: "purple-melancholia",
        client_original_filename: "VALENTINO - VALENTINO MELANCHOLIA (2).png",
        media_role: "set",
        status: "ALIAS_CONFIRMED",
        match_basis: "CLIENT_CONFIRMED_DECISION_AND_IMG_MAP_PAIR_CONVENTION",
      }),
      expect.objectContaining({
        legacy_product_id: "purple-melancholia",
        client_original_filename: "VALENTINO - VALENTINO MELANCHOLIA.png",
        media_role: "bottle",
        status: "ALIAS_CONFIRMED",
        match_basis: "CLIENT_CONFIRMED_DECISION",
      }),
    ]);
  });

  it("keeps fuzzy-only similarity ambiguous", () => {
    const result = reconcileClientMedia({
      products: [
        {
          id: "liquid-brun",
          name: "Liquid Brun",
          brand: "French Avenue",
          type: "arab",
          img: null,
          imgBottle: null,
          imgSet: null,
        },
      ],
      clientFilenames: ["FRENCH AVENEU - LIQUID BRUN.png"],
    });

    expect(result.records[0]).toMatchObject({
      legacy_product_id: null,
      status: "AMBIGUOUS",
      match_basis: "FUZZY_CANDIDATE_ONLY",
      candidate_legacy_product_ids: ["liquid-brun"],
    });
  });

  it("preserves the documented missing status for Sceptre Malachite", () => {
    const result = reconcileClientMedia({
      products: [
        {
          id: "sceptre-malachite",
          name: "Sceptre Malachite",
          brand: "Maison Alhambra",
          type: "arab",
          img: "img/perfumes/transparent/MAISON ALHAMBRA - SCEPTRE MALACHITE.webp",
          imgBottle: "img/perfumes/transparent/MAISON ALHAMBRA - SCEPTRE MALACHITE.webp",
          imgSet: null,
        },
      ],
      clientFilenames: [],
    });

    expect(result.records).toContainEqual(
      expect.objectContaining({
        legacy_product_id: "sceptre-malachite",
        client_original_filename: null,
        status: "CLIENT_ASSET_MISSING",
      }),
    );
  });

  it("marks duplicate normalized filenames as a collision", () => {
    const result = reconcileClientMedia({
      products: [baseProduct],
      clientFilenames: [
        "LATTAFA - KHAMRAH CLASICO.png",
        "LATTAFA__KHAMRAH CLASICO.png",
      ],
    });

    expect(result.records.filter((record) => record.client_original_filename)).toEqual([
      expect.objectContaining({ status: "AMBIGUOUS", match_basis: "DUPLICATE_NORMALIZED_FILENAME" }),
      expect.objectContaining({ status: "AMBIGUOUS", match_basis: "DUPLICATE_NORMALIZED_FILENAME" }),
    ]);
  });

  it("sorts and serializes output deterministically", () => {
    const first = {
      legacy_product_id: "zeta",
      legacy_product_name: "Zeta",
      brand: null,
      current_legacy_image: null,
      client_original_filename: "Zeta.png",
      media_role: "bottle",
      status: "EXACT_MATCH",
      match_basis: "TEST",
      notes: "",
      source: [],
      candidate_legacy_product_ids: [],
    } satisfies ReconciliationRecord;
    const second = {
      ...first,
      legacy_product_id: "alpha",
      legacy_product_name: "Alpha",
      client_original_filename: "Alpha.png",
    } satisfies ReconciliationRecord;

    const forward = sortReconciliationRecords([first, second]);
    const reverse = sortReconciliationRecords([second, first]);
    expect(forward).toEqual(reverse);
    expect(serializeReconciliationArtifact({ records: forward })).toBe(
      serializeReconciliationArtifact({ records: reverse }),
    );
  });
});
