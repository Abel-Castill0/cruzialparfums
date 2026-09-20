import { describe, expect, it } from "vitest";
import { compareCatalogs } from "./catalog-parity";
import { mapPublicProduct, type PublicProductRow } from "./supabase-public-catalog-repository";
import { LegacyCatalogRepository } from "./legacy-catalog-repository";

describe("catalog parity oracle", () => {
  it("classifies a legacy product absent from Supabase as expected blocked publication", () => {
    const legacy = new LegacyCatalogRepository().listFragrances().slice(0, 2);
    expect(compareCatalogs(legacy, [])).toEqual(legacy
      .map((product) => expect.objectContaining({ identity: product.legacyId, field: "missing_in_supabase", classification: "EXPECTED_BLOCKED" }))
      .sort());
  });

  it("classifies a public Supabase-only product as a real mapping bug", () => {
    const supabaseOnly = new LegacyCatalogRepository().listFragrances()[0]!;
    expect(compareCatalogs([], [supabaseOnly])).toEqual([expect.objectContaining({
      identity: supabaseOnly.legacyId,
      field: "unexpected_in_supabase",
      classification: "REAL_MAPPING_BUG",
    })]);
  });

  it("classifies exact comparable mapping changes as real bugs and media source changes separately", () => {
    const legacy = new LegacyCatalogRepository().findByLegacyId("1-million-lucky")!;
    const publicRow: PublicProductRow = {
      business_unit_id: "11111111-1111-4111-8111-111111111111",
      legacy_id: legacy.legacyId,
      slug: legacy.slug,
      brand: legacy.brand,
      name: `${legacy.name} changed`,
      description: legacy.description,
      gender: legacy.gender,
      concentration: legacy.concentration,
      production_status: "active",
      availability_status: "available",
      publication_status: "published",
      archived_at: null,
      is_featured: false,
      featured_rank: null,
      featured_from: null,
      featured_until: null,
      verification_status: "legacy",
      notes: legacy.notes,
      tag: legacy.tag,
      product_variants: legacy.variants.map((variant) => ({
        id: variant.variantId,
        label: variant.label,
        variant_kind: variant.kind,
        size_ml: variant.sizeMl,
        price_amount: variant.priceAmount,
        currency: variant.currency,
        publication_status: "published",
        archived_at: null,
        sort_order: variant.sortOrder,
        price_verification_status: variant.priceVerificationStatus,
      })),
      product_media: [{ provider: "cloudinary", secure_url: "https://res.cloudinary.com/demo/new.webp", alt: legacy.imageAlt, is_primary: true, sort_order: 0, archived_at: null, product_variant_id: null, media_role: "set" }],
      product_categories: [
        { sort_order: 0, category: { business_unit_id: "11111111-1111-4111-8111-111111111111", kind: "commercial_type", slug: legacy.type, name: legacy.type, publication_status: "published", archived_at: null } },
        { sort_order: 1, category: { business_unit_id: "11111111-1111-4111-8111-111111111111", kind: "olfactory_family", slug: "family", name: legacy.family, publication_status: "published", archived_at: null } },
      ],
    };
    const mapped = mapPublicProduct(publicRow)!;
    const differences = compareCatalogs([legacy], [mapped]);
    expect(differences).toContainEqual(expect.objectContaining({ field: "name", classification: "REAL_MAPPING_BUG" }));
    expect(differences).toContainEqual(expect.objectContaining({ field: "media", classification: "EXPECTED_SOURCE_DIFFERENCE" }));
  });
});
