import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  normalizeCategorySlug,
  reconcileCommercialCatalog,
  serializeCommercialReconciliation,
  type LegacyStaging,
  type LegacyStagingEntry,
  type ReconciledProduct,
} from "../../../../../scripts/commercial-reconciliation.mjs";

const repositoryRoot = resolve(process.cwd(), "../..");

function fixtureEntry(overrides: Partial<LegacyStagingEntry> = {}): LegacyStagingEntry {
  return {
    legacy_id: "sample-product",
    product: {
      legacy_id: "sample-product",
      slug: "sample-product",
      name: "Sample Product",
      brand: "Sample Brand",
      description: "Legacy description",
      gender: "unisex",
      concentration: "EDP",
      sales_mode: "always_available",
      production_status: "active",
      availability_status: "available",
      publication_status: "draft",
      is_featured: false,
      featured_rank: null,
      featured_from: null,
      featured_until: null,
      verification_status: "legacy",
      specs: {
        family: "Ámbar",
        notes: [],
        tag: "Árabe",
        legacy_hidden: false,
        legacy_bestseller_unverified: false,
      },
    },
    variants: [
      {
        label: "3 ml",
        variant_kind: "decant",
        size_ml: 3,
        price_amount: 12,
        currency: "PEN",
        publication_status: "draft",
        price_verification_status: "legacy",
        sort_order: 0,
      },
    ],
    categories: [
      { kind: "commercial_type", slug: "arab" },
      { kind: "olfactory_family", slug: "ámbar" },
    ],
    fingerprint: "fixture",
    ...overrides,
  };
}

function reconcile(entries: LegacyStagingEntry[], staging: Partial<LegacyStaging> = {}) {
  return reconcileCommercialCatalog({
    staging: { entries, blocked: [], invalid: [], ...staging },
    sourceFingerprints: { fixture: "abc123" },
  });
}

function first<T>(items: readonly T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error("Expected a non-empty test collection");
  return item;
}

function fieldEvidence(product: ReconciledProduct, field: string) {
  const value = product.field_provenance[field];
  if (value === undefined) throw new Error(`Missing field provenance for ${field}`);
  return value;
}

describe("commercial reconciliation", () => {
  it("uses the committed legacy staging artifact as its complete non-combo input", () => {
    const staging = JSON.parse(readFileSync(
      resolve(repositoryRoot, "supabase/staging/legacy-catalog-staging.json"),
      "utf8",
    )) as LegacyStaging;
    const result = reconcileCommercialCatalog({ staging, documentedBottlePriceCount: 24 });

    expect(result.summary).toMatchObject({
      legacy_products_considered: 99,
      staged_non_combo_products: 96,
      variants: 312,
      blocked: 3,
      conflicts: 0,
    });
    expect(result.blocked).toHaveLength(3);
    expect(result.blocked.every((item) => item.entity === "combo")).toBe(true);
    expect(result.conflicts).toEqual([]);
    expect(result.category_targets).toHaveLength(11);
    expect(result.category_targets).toContainEqual(expect.objectContaining({
      kind: "commercial_type",
      slug: "arabic",
      name: "Árabe",
      publication_status: "draft",
    }));
  });

  it("keeps every current legacy price exact, legacy, draft, and not publishable", () => {
    const staging = JSON.parse(readFileSync(
      resolve(repositoryRoot, "supabase/staging/legacy-catalog-staging.json"),
      "utf8",
    )) as LegacyStaging;
    const result = reconcileCommercialCatalog({ staging });
    const sourcePrices = (staging.entries ?? []).flatMap((entry) => entry.variants.map((variant) => variant.price_amount));
    const targetVariants = result.products.flatMap((product) => product.variants);

    expect(targetVariants.map((variant) => variant.price_amount)).toEqual(sourcePrices);
    expect(targetVariants.every((variant) => variant.price_verification_status === "legacy")).toBe(true);
    expect(targetVariants.every((variant) => variant.publication_status === "draft")).toBe(true);
    expect(result.summary.confirmed_price_variants).toBe(0);
    expect(result.summary.legacy_bottle_price_variants).toBe(24);
    expect(result.summary.confirmed_bottle_price_variants).toBe(0);
  });

  it("records documented field evidence without promoting the mixed product status", () => {
    const entry = fixtureEntry({
      legacy_id: "red-intensely",
      product: { ...fixtureEntry().product, legacy_id: "red-intensely", slug: "red-intensely", name: "Nitro Red Intensely", brand: "Dumont Paris" },
    });
    const product = first(reconcile([entry]).products);

    expect(fieldEvidence(product, "name").provenance).toEqual(["CLIENT_CONFIRMED", "DERIVED_VALIDATED"]);
    expect(fieldEvidence(product, "brand").provenance).toEqual(["CLIENT_CONFIRMED", "DERIVED_VALIDATED"]);
    expect(fieldEvidence(product, "description").provenance).toEqual(["legacy"]);
    expect(product.target_product.verification_status).toBe("legacy");
    expect(product.migration_status).toBe("MIGRATABLE_WITH_VERIFIED_FIELDS");
    expect(product.publish_eligibility).toBe("NOT_READY");
  });

  it("maps the client-confirmed hidden state independently from availability", () => {
    const base = fixtureEntry();
    const entry = fixtureEntry({
      legacy_id: "bir-intense",
      product: {
        ...base.product,
        legacy_id: "bir-intense",
        slug: "bir-intense",
        name: "Burberry Brit Intense",
        specs: { ...base.product.specs, legacy_hidden: true },
      },
    });
    const product = first(reconcile([entry]).products);

    expect(product.target_product.publication_status).toBe("hidden");
    expect(product.target_product.availability_status).toBe("available");
    expect(product.publish_eligibility).toBe("BLOCKED");
    expect(fieldEvidence(product, "publication_status").provenance).toEqual(["CLIENT_CONFIRMED"]);
    expect(fieldEvidence(product, "specs.legacy_hidden").provenance).toEqual(["CLIENT_CONFIRMED"]);
  });

  it("preserves discontinued and available as independent status axes", () => {
    const base = fixtureEntry();
    const product = first(reconcile([fixtureEntry({
      product: { ...base.product, production_status: "discontinued", availability_status: "available" },
    })]).products);

    expect(product.target_product).toMatchObject({ production_status: "discontinued", availability_status: "available", publication_status: "draft" });
    expect(product.warnings).toContain("DISCONTINUED_AVAILABLE_PRESERVED_INDEPENDENTLY");
  });

  it("normalizes category identities deterministically and rejects unknown commercial types", () => {
    expect(normalizeCategorySlug("  Ámbar Intenso  ")).toBe("ambar-intenso");
    const valid = first(reconcile([fixtureEntry()]).products);
    expect(valid.categories).toMatchObject([
      { kind: "commercial_type", source_slug: "arab", target_slug: "arabic", transformation: "EXPLICIT_STABLE_IDENTITY_MAP" },
      { kind: "olfactory_family", source_slug: "ámbar", target_slug: "ambar", transformation: "ASCII_SLUG_NORMALIZATION" },
    ]);

    const invalidEntry = fixtureEntry({ categories: [{ kind: "commercial_type", slug: "luxury" }] });
    const invalid = reconcile([invalidEntry]);
    expect(first(invalid.products).migration_status).toBe("BLOCKED");
    expect(invalid.conflicts.some((conflict) => conflict.code === "INVALID_COMMERCIAL_TYPE")).toBe(true);
  });

  it("reports duplicate target slugs and duplicate variant labels instead of resolving them", () => {
    const firstEntry = fixtureEntry();
    const secondBase = fixtureEntry();
    const second = fixtureEntry({
      legacy_id: "second-product",
      product: { ...secondBase.product, legacy_id: "second-product", slug: "sample-product", name: "Second" },
      variants: [first(secondBase.variants), { ...first(secondBase.variants) }],
    });
    const result = reconcile([firstEntry, second]);

    expect(result.conflicts.some((conflict) => conflict.code === "DUPLICATE_TARGET_SLUG")).toBe(true);
    expect(result.conflicts.some((conflict) => conflict.code === "DUPLICATE_VARIANT_LABEL")).toBe(true);
    expect(result.products.every((product) => product.migration_status === "BLOCKED")).toBe(true);
  });

  it("blocks duplicate legacy identities, invalid prices, and products without usable variants", () => {
    const duplicate = fixtureEntry();
    const invalidPriceBase = fixtureEntry();
    const invalidPrice = fixtureEntry({
      legacy_id: "invalid-price",
      product: { ...invalidPriceBase.product, legacy_id: "invalid-price", slug: "invalid-price" },
      variants: [{ ...first(invalidPriceBase.variants), price_amount: -1 }],
    });
    const noVariantBase = fixtureEntry();
    const noVariant = fixtureEntry({
      legacy_id: "no-variant",
      product: { ...noVariantBase.product, legacy_id: "no-variant", slug: "no-variant" },
      variants: [],
    });
    const result = reconcile([duplicate, { ...duplicate }, invalidPrice, noVariant]);

    expect(result.conflicts.some((conflict) => conflict.code === "DUPLICATE_LEGACY_ID")).toBe(true);
    expect(result.conflicts.some((conflict) => conflict.code === "INVALID_VARIANT_PRICE")).toBe(true);
    expect(result.conflicts.some((conflict) => conflict.code === "NO_USABLE_VARIANT")).toBe(true);
  });

  it("detects category normalization collisions against the schema's unit-wide slug uniqueness", () => {
    const collision = fixtureEntry({
      categories: [
        { kind: "commercial_type", slug: "designer" },
        { kind: "olfactory_family", slug: "designer" },
      ],
    });
    const result = reconcile([collision]);

    expect(result.conflicts).toContainEqual(expect.objectContaining({ code: "CATEGORY_NORMALIZATION_COLLISION" }));
    expect(first(result.products).migration_status).toBe("BLOCKED");
  });

  it("reports the documented bottle-price count drift without changing any price", () => {
    const result = reconcileCommercialCatalog({
      staging: { entries: [fixtureEntry()], blocked: [], invalid: [] },
      documentedBottlePriceCount: 23,
    });

    expect(result.conflicts).toContainEqual({
      code: "DOCUMENTED_BOTTLE_PRICE_COUNT_MISMATCH",
      legacy_ids: [],
      detail: "docs/client-decisions.md records 23; current legacy staging contains 0",
    });
    expect(first(first(result.products).variants).price_amount).toBe(12);
  });

  it("keeps pending combo composition blocked with no target tables", () => {
    const result = reconcile([fixtureEntry()], {
      blocked: [{ legacy_id: "combo-vainilla", reason: "combo composition is CLIENT_PROVIDED_PENDING_RECONFIRMATION" }],
    });

    expect(first(result.blocked)).toMatchObject({
      legacy_id: "combo-vainilla",
      entity: "combo",
      migration_status: "BLOCKED",
      publish_eligibility: "BLOCKED",
      target_tables: [],
    });
  });

  it("orders products deterministically and serializes byte-identically", () => {
    const alphaBase = fixtureEntry();
    const alpha = fixtureEntry({ legacy_id: "alpha", product: { ...alphaBase.product, legacy_id: "alpha", slug: "alpha", name: "Alpha" } });
    const zuluBase = fixtureEntry();
    const zulu = fixtureEntry({ legacy_id: "zulu", product: { ...zuluBase.product, legacy_id: "zulu", slug: "zulu", name: "Zulu" } });
    const forward = reconcile([alpha, zulu]);
    const reverse = reconcile([zulu, alpha]);

    expect(reverse.products.map((product) => product.legacy_id)).toEqual(["alpha", "zulu"]);
    expect(serializeCommercialReconciliation(reverse)).toBe(serializeCommercialReconciliation(forward));
    expect(serializeCommercialReconciliation(reverse)).toBe(serializeCommercialReconciliation(reverse));
  });
});
