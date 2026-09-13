import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  normalizeCategorySlug,
  PRICE_VERIFICATION_STATUSES,
  PRODUCT_LIFECYCLE_OVERRIDES,
  reconcileCommercialCatalog,
  serializeCommercialReconciliation,
  SUPPLEMENTAL_PRODUCTS,
  VARIANT_PRICE_OVERRIDES,
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

function reconcile(
  entries: LegacyStagingEntry[],
  staging: Partial<LegacyStaging> = {},
  overrides: Record<string, unknown> = {},
) {
  return reconcileCommercialCatalog({
    staging: { entries, blocked: [], invalid: [], ...staging },
    sourceFingerprints: { fixture: "abc123" },
    // Isolated from the module's real 4K-B2A default overrides/supplements by
    // default, so a generic-mechanism test using a synthetic fixture never
    // silently picks up production overrides (e.g. the real Le Male
    // supplemental sorting ahead of a "sample-product" fixture). Tests that
    // want to exercise a specific override pass it explicitly via `overrides`.
    variantPriceOverrides: [],
    productLifecycleOverrides: [],
    supplementalProducts: [],
    ...overrides,
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
      // 4K-B2A applies default overrides/supplements: +1 supplemental product
      // (Le Male Le Parfum) and its 3 decant variants on top of the 96
      // legacy-staged products / 312 legacy variants.
      legacy_products_considered: 100,
      staged_non_combo_products: 97,
      variants: 315,
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

  it("keeps every variant draft, and every bottle price legacy/provisional_market and never confirmed (4K-B2A Part H, 4K-B2B.2A/2B)", () => {
    const staging = JSON.parse(readFileSync(
      resolve(repositoryRoot, "supabase/staging/legacy-catalog-staging.json"),
      "utf8",
    )) as LegacyStaging;
    const result = reconcileCommercialCatalog({ staging });
    const targetVariants = result.products.flatMap((product) => product.variants);
    const bottleVariants = targetVariants.filter((variant) => variant.variant_kind === "bottle");

    expect(targetVariants.every((variant) => variant.publication_status === "draft")).toBe(true);
    // The official 2026 PDF has no full-bottle prices (4K-A3 bottle_price_authority
    // finding); bottle rows must never be silently promoted to official_pdf. As of
    // 4K-B2B.2B Batch B, 11 of the 24 (6 from Batch A + 5 from Batch B) carry an
    // operator-authorized provisional_market price instead of legacy — still never
    // official_pdf/client_confirmed.
    expect(bottleVariants).toHaveLength(24);
    expect(bottleVariants.every((variant) => variant.price_verification_status === "legacy" || variant.price_verification_status === "provisional_market")).toBe(true);
    expect(result.summary.legacy_bottle_price_variants).toBe(13);
    expect(result.summary.provisional_market_bottle_price_variants).toBe(11);
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
    // "bir-intense" is safe here: reconcile()'s helper defaults every override
    // collection to empty (see its definition above), so this generic-fixture
    // test never picks up the real PRODUCT_LIFECYCLE_OVERRIDES entry that
    // legacy_id carries in production (4K-B2A Part E) — that entry is
    // exercised separately in the "4K-B2A official PDF commercial authority
    // applied" describe block below, against the real staging artifact.
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
      variantPriceOverrides: [],
      productLifecycleOverrides: [],
      supplementalProducts: [],
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

describe("4K-B1 commercial authority reconciliation infrastructure", () => {
  it("keeps a variant legacy and unchanged when no override targets it", () => {
    const product = first(reconcile([fixtureEntry()]).products);
    expect(first(product.variants)).toMatchObject({ price_amount: 12, price_verification_status: "legacy" });
  });

  it("lets an official_pdf variant price override win deterministically over the legacy price", () => {
    const entry = fixtureEntry();
    const result = reconcile([entry], {}, {
      variantPriceOverrides: [{
        legacy_id: "sample-product",
        variant_kind: "decant",
        size_ml: 3,
        price_amount: 30,
        price_verification_status: "official_pdf",
        evidence: { provenance: ["OFFICIAL_PDF"], basis: "2026 catalogue, page 12" },
      }],
    });
    const variant = first(first(result.products).variants);

    expect(variant.price_amount).toBe(30);
    expect(variant.price_verification_status).toBe("official_pdf");
    expect(variant.price_provenance).toEqual({ provenance: ["OFFICIAL_PDF"], basis: "2026 catalogue, page 12" });
    expect(variant.blockers).toEqual([]);
    expect(first(result.products).warnings).toContain("VARIANT_PRICE_OVERRIDE_APPLIED");
  });

  it("keeps a provisional_market price non-official/non-client-confirmed and blocked from publication", () => {
    const entry = fixtureEntry();
    const result = reconcile([entry], {}, {
      variantPriceOverrides: [{
        legacy_id: "sample-product",
        variant_kind: "decant",
        size_ml: 3,
        price_amount: 18,
        price_verification_status: "provisional_market",
        evidence: { provenance: ["UNKNOWN"], basis: "Operator market research, not client-confirmed" },
      }],
    });
    const product = first(result.products);
    const variant = first(product.variants);

    expect(variant.price_verification_status).toBe("provisional_market");
    expect(PRICE_VERIFICATION_STATUSES).toContain("provisional_market");
    expect(variant.price_verification_status).not.toBe("official_pdf");
    expect(variant.price_verification_status).not.toBe("client_confirmed");
    expect(variant.blockers).toContain("PROVISIONAL_MARKET_PRICE_REQUIRES_COMMERCIAL_APPROVAL");
    expect(product.blockers).toContain("PROVISIONAL_MARKET_PRICES_REQUIRE_COMMERCIAL_APPROVAL");
    expect(result.summary.confirmed_price_variants).toBe(0);
  });

  it("lets a client_confirmed override supersede a weaker provenance deterministically", () => {
    const entry = fixtureEntry();
    const result = reconcile([entry], {}, {
      variantPriceOverrides: [{
        legacy_id: "sample-product",
        variant_kind: "decant",
        size_ml: 3,
        price_amount: 33,
        price_verification_status: "client_confirmed",
        evidence: { provenance: ["CLIENT_CONFIRMED"], basis: "Client confirmed via WhatsApp 2026-09-13" },
      }],
    });
    const variant = first(first(result.products).variants);

    expect(variant.price_amount).toBe(33);
    expect(variant.price_verification_status).toBe("client_confirmed");
    expect(variant.blockers).toEqual([]);
    expect(result.summary.confirmed_price_variants).toBe(1);
  });

  it("lets a documented lifecycle override archive a product while preserving its identity and history", () => {
    const entry = fixtureEntry();
    const result = reconcile([entry], {}, {
      productLifecycleOverrides: [{
        legacy_id: "sample-product",
        publication_status: "archived",
        evidence: { provenance: ["OFFICIAL_PDF"], basis: "Absent from the 2026 official PDF; excluded from current authority" },
      }],
    });
    const product = first(result.products);

    expect(product.legacy_id).toBe("sample-product");
    expect(product.target_product.publication_status).toBe("archived");
    expect(product.field_provenance.publication_status).toEqual({
      provenance: ["OFFICIAL_PDF"],
      basis: "Absent from the 2026 official PDF; excluded from current authority",
    });
    expect(product.warnings).toContain("CURRENT_AUTHORITY_LIFECYCLE_OVERRIDE_APPLIED");
    expect(product.conflicts).toEqual([]);
  });

  it("represents a supplemental official-source product without requiring a legacy source row", () => {
    const result = reconcile([], {}, {
      supplementalProducts: [{
        slug: "le-male-le-parfum",
        name: "Le Male Le Parfum",
        brand: "Jean Paul Gaultier",
        variants: [{
          label: "3 ml",
          variant_kind: "decant",
          size_ml: 3,
          price_amount: 1,
          currency: "PEN",
          publication_status: "draft",
          price_verification_status: "unknown",
          sort_order: 0,
        }],
      }],
      variantPriceOverrides: [{
        slug: "le-male-le-parfum",
        variant_kind: "decant",
        size_ml: 3,
        price_amount: 24,
        price_verification_status: "official_pdf",
        evidence: { provenance: ["OFFICIAL_PDF"], basis: "2026 catalogue, page 32" },
      }],
    });
    const product = first(result.products);

    expect(product.legacy_id).toBeNull();
    expect(product.target_product.slug).toBe("le-male-le-parfum");
    expect(product.target_product.verification_status).toBe("unknown");
    expect(first(product.variants).price_amount).toBe(24);
    expect(first(product.variants).price_verification_status).toBe("official_pdf");
    expect(fieldEvidence(product, "description").provenance).toEqual(["UNKNOWN"]);
    expect(fieldEvidence(product, "gender").provenance).toEqual(["UNKNOWN"]);
  });

  it("does not fabricate unresolved fields on a supplemental product", () => {
    const result = reconcile([], {}, {
      supplementalProducts: [{
        slug: "unresolved-supplement",
        name: "Unresolved Supplement",
        variants: [first(fixtureEntry().variants)],
      }],
    });
    const product = first(result.products);

    expect(product.target_product.brand).toBeNull();
    expect(product.target_product.description).toBeNull();
    expect(product.target_product.gender).toBeNull();
    expect(product.target_product.concentration).toBeNull();
  });

  it("fails loudly on duplicate/conflicting variant price overrides instead of letting one silently win", () => {
    expect(() => reconcile([fixtureEntry()], {}, {
      variantPriceOverrides: [
        {
          legacy_id: "sample-product",
          variant_kind: "decant",
          size_ml: 3,
          price_amount: 30,
          price_verification_status: "official_pdf",
          evidence: { provenance: ["OFFICIAL_PDF"], basis: "First" },
        },
        {
          legacy_id: "sample-product",
          variant_kind: "decant",
          size_ml: 3,
          price_amount: 18,
          price_verification_status: "provisional_market",
          evidence: { provenance: ["UNKNOWN"], basis: "Second, conflicting" },
        },
      ],
    })).toThrow(/[Cc]onflicting/);
  });

  it("fails loudly on a variant price override that asserts legacy authority", () => {
    expect(() => reconcile([fixtureEntry()], {}, {
      variantPriceOverrides: [{
        legacy_id: "sample-product",
        variant_kind: "decant",
        size_ml: 3,
        price_amount: 12,
        price_verification_status: "legacy",
        evidence: { provenance: ["legacy"], basis: "Should not be allowed as an override" },
      }],
    })).toThrow(/legacy/);
  });

  it("applies no override at all when every override collection is passed explicitly empty (mechanism is inert without input)", () => {
    // 4K-B2A populated the module's real default exports, so this no longer
    // compares against the *default* call (see the 4K-B2A describe block
    // below for what the real, populated defaults do) — it proves the
    // mechanism itself, not any particular data set, is a no-op when empty.
    const staging: LegacyStaging = { entries: [fixtureEntry()], blocked: [], invalid: [] };
    const result = reconcileCommercialCatalog({
      staging,
      variantPriceOverrides: [],
      productLifecycleOverrides: [],
      supplementalProducts: [],
    });
    const product = first(result.products);

    expect(product.target_product.publication_status).toBe("draft");
    expect(first(product.variants)).toMatchObject({ price_amount: 12, price_verification_status: "legacy" });
    expect(product.warnings).not.toContain("VARIANT_PRICE_OVERRIDE_APPLIED");
    expect(product.warnings).not.toContain("CURRENT_AUTHORITY_LIFECYCLE_OVERRIDE_APPLIED");
  });
});

describe("4K-B2A official PDF commercial authority applied", () => {
  const staging = JSON.parse(readFileSync(
    resolve(repositoryRoot, "supabase/staging/legacy-catalog-staging.json"),
    "utf8",
  )) as LegacyStaging;
  const result = reconcileCommercialCatalog({ staging, documentedBottlePriceCount: 24 });
  const productById = (identity: string | null) =>
    result.products.find((product) => (product.legacy_id ?? product.target_product.slug) === identity);
  const variantByLabel = (product: ReconciledProduct, label: string) =>
    product.variants.find((variant) => variant.label === label);

  it("gives an unchanged official-PDF decant price official_pdf status without changing its number (1)", () => {
    // khamrah-clasico is one of the 279 comparable rows where v2_current already equalled official_pdf.
    const product = productById("khamrah-clasico");
    if (!product) throw new Error("Expected khamrah-clasico in the reconciled catalog");
    expect(variantByLabel(product, "3 ml")).toMatchObject({ price_amount: 12, price_verification_status: "official_pdf" });
  });

  it("corrects Sauvage EDT to the official PDF prices (2)", () => {
    const product = productById("sauvage-edt");
    if (!product) throw new Error("Expected sauvage-edt in the reconciled catalog");
    expect(variantByLabel(product, "3 ml")).toMatchObject({ price_amount: 30, price_verification_status: "official_pdf" });
    expect(variantByLabel(product, "5 ml")).toMatchObject({ price_amount: 38, price_verification_status: "official_pdf" });
    expect(variantByLabel(product, "10 ml")).toMatchObject({ price_amount: 69, price_verification_status: "official_pdf" });
  });

  it("corrects Dylan Blue to the official PDF prices (3)", () => {
    const product = productById("dylan-blue");
    if (!product) throw new Error("Expected dylan-blue in the reconciled catalog");
    expect(variantByLabel(product, "3 ml")).toMatchObject({ price_amount: 22, price_verification_status: "official_pdf" });
    expect(variantByLabel(product, "5 ml")).toMatchObject({ price_amount: 30, price_verification_status: "official_pdf" });
    expect(variantByLabel(product, "10 ml")).toMatchObject({ price_amount: 48, price_verification_status: "official_pdf" });
  });

  it("adds Le Male Le Parfum as a supplemental product with all 3 official_pdf prices (4)", () => {
    const product = productById("le-male-le-parfum");
    if (!product) throw new Error("Expected le-male-le-parfum in the reconciled catalog");
    expect(product.legacy_id).toBeNull();
    expect(variantByLabel(product, "3 ml")).toMatchObject({ price_amount: 24, price_verification_status: "official_pdf" });
    expect(variantByLabel(product, "5 ml")).toMatchObject({ price_amount: 32, price_verification_status: "official_pdf" });
    expect(variantByLabel(product, "10 ml")).toMatchObject({ price_amount: 51, price_verification_status: "official_pdf" });
    // Not fabricated: no evidence in the persisted PDF reconciliation states a brand.
    expect(product.target_product.brand).toBeNull();
  });

  it("archives invictus-elixir instead of deleting it, and does not reinterpret its price as official_pdf (5)", () => {
    const product = productById("invictus-elixir");
    if (!product) throw new Error("Expected invictus-elixir to still be present (archived, not deleted)");
    expect(product.target_product.publication_status).toBe("archived");
    expect(product.variants.every((variant) => variant.price_verification_status !== "official_pdf")).toBe(true);
  });

  it("no longer keeps bir-intense hidden solely due to the superseded 2026-09-06 no-stock decision (6)", () => {
    const product = productById("bir-intense");
    if (!product) throw new Error("Expected bir-intense in the reconciled catalog");
    expect(product.target_product.publication_status).not.toBe("hidden");
    expect(variantByLabel(product, "3 ml")).toMatchObject({ price_amount: 26, price_verification_status: "official_pdf" });
    expect(variantByLabel(product, "5 ml")).toMatchObject({ price_amount: 34, price_verification_status: "official_pdf" });
    expect(variantByLabel(product, "10 ml")).toMatchObject({ price_amount: 56, price_verification_status: "official_pdf" });
  });

  it("keeps manufacturer-discontinued products available/sellable, not archived/hidden/out_of_stock (7)", () => {
    for (const legacyId of ["lovely-cherry", "bright-peach", "ultra-male"]) {
      const product = productById(legacyId);
      if (!product) throw new Error(`Expected ${legacyId} in the reconciled catalog`);
      expect(product.target_product.production_status).toBe("discontinued");
      expect(product.target_product.availability_status).toBe("available");
      expect(product.target_product.publication_status).not.toBe("archived");
      expect(product.target_product.publication_status).not.toBe("hidden");
      expect(product.warnings).toContain("DISCONTINUED_AVAILABLE_PRESERVED_INDEPENDENTLY");
    }
  });

  it("represents official-PDF-confirmed combo composition and price for all 3 combos (8)", () => {
    const expected: Record<string, { members: string[]; price: number[] }> = {
      "combo-cuarteto": { members: ["khamrah-qahwa", "khamrah-clasico", "khamrah-waha", "khamrah-dukhan"], price: [40, 55, 89] },
      "combo-vainilla": { members: ["yara-pink", "yara-candy", "eclaire"], price: [27, 39, 65] },
      "combo-tulum": { members: ["odyssey-aqua", "hawas-tropical", "supremacy-colle"], price: [31, 42, 71] },
    };
    for (const [legacyId, { members, price }] of Object.entries(expected)) {
      const blockedCombo = result.blocked.find((item) => item.legacy_id === legacyId) as
        | { composition_verification_status?: string; composition_legacy_ids?: string[]; decant_price_3_5_10?: number[] }
        | undefined;
      if (!blockedCombo) throw new Error(`Expected ${legacyId} in result.blocked`);
      expect(blockedCombo.composition_verification_status).toBe("official_pdf");
      expect(blockedCombo.composition_legacy_ids).toEqual(members);
      expect(blockedCombo.decant_price_3_5_10).toEqual(price);
    }
  });

  it("never gives a bottle variant official_pdf authority (9)", () => {
    const bottleVariants = result.products.flatMap((product) => product.variants).filter((variant) => variant.variant_kind === "bottle");
    expect(bottleVariants.length).toBeGreaterThan(0);
    expect(bottleVariants.every((variant) => variant.price_verification_status !== "official_pdf")).toBe(true);
    expect(bottleVariants.every((variant) => variant.price_verification_status !== "client_confirmed")).toBe(true);
  });

  it("builds VARIANT_PRICE_OVERRIDES deterministically with no duplicate override keys (10)", () => {
    const keys = VARIANT_PRICE_OVERRIDES.map((override) => `${override.legacy_id ?? override.slug}:${override.variant_kind}:${override.size_ml}`);
    expect(new Set(keys).size).toBe(keys.length);
    // 285 official_pdf decant overrides (4K-B2A) + 11 provisional_market bottle
    // overrides (6 Batch A + 5 Batch B) applied from
    // supabase/staging/bottle-market-research.json (4K-B2B.2A + 4K-B2B.2B).
    expect(VARIANT_PRICE_OVERRIDES).toHaveLength(296);
    expect(() => reconcileCommercialCatalog({ staging, documentedBottlePriceCount: 24 })).not.toThrow();
    // Re-running is byte-identical: the mapping is a pure function of the persisted artifact.
    const again = reconcileCommercialCatalog({ staging, documentedBottlePriceCount: 24 });
    expect(serializeCommercialReconciliation(again)).toBe(serializeCommercialReconciliation(result));
  });

  it("declares exactly the two documented lifecycle overrides and one supplemental product", () => {
    expect(PRODUCT_LIFECYCLE_OVERRIDES.map((override) => override.legacy_id ?? override.slug).sort()).toEqual([
      "bir-intense",
      "invictus-elixir",
    ]);
    expect(SUPPLEMENTAL_PRODUCTS.map((product) => product.slug)).toEqual(["le-male-le-parfum"]);
  });
});

describe("4K-B2B.1 variant-aware readiness contract", () => {
  // A product shaped like the real catalog: three clean official_pdf decants
  // (3/5/10 ml) plus one legacy, commercially-unconfirmed bottle -- the exact
  // shape the gate's Section E/F/G describe. Built with the generic fixture
  // helper (not the real staging artifact) so this block stays independent of
  // any specific legacy_id's live data.
  function mixedReadinessProduct() {
    const base = fixtureEntry();
    const entry = fixtureEntry({
      legacy_id: "mixed-readiness-product",
      product: { ...base.product, legacy_id: "mixed-readiness-product", slug: "mixed-readiness-product" },
      variants: [
        { label: "3 ml", variant_kind: "decant", size_ml: 3, price_amount: 26, currency: "PEN", publication_status: "draft", price_verification_status: "legacy", sort_order: 0 },
        { label: "5 ml", variant_kind: "decant", size_ml: 5, price_amount: 34, currency: "PEN", publication_status: "draft", price_verification_status: "legacy", sort_order: 1 },
        { label: "10 ml", variant_kind: "decant", size_ml: 10, price_amount: 56, currency: "PEN", publication_status: "draft", price_verification_status: "legacy", sort_order: 2 },
        { label: "Frasco 100 ml", variant_kind: "bottle", size_ml: 100, price_amount: 780, currency: "PEN", publication_status: "draft", price_verification_status: "legacy", sort_order: 3 },
      ],
    });
    return reconcile([entry], {}, {
      variantPriceOverrides: [3, 5, 10].map((size, index) => ({
        legacy_id: "mixed-readiness-product",
        variant_kind: "decant",
        size_ml: size,
        price_amount: [26, 34, 56][index],
        price_verification_status: "official_pdf",
        evidence: { provenance: ["OFFICIAL_PDF"], basis: "fixture: official 2026 catalogue" },
      })),
    });
  }

  it("keeps a legacy/provisional bottle blocker scoped to the bottle variant itself (G1)", () => {
    const product = first(mixedReadinessProduct().products);
    const bottle = product.variants.find((variant) => variant.variant_kind === "bottle");
    if (!bottle) throw new Error("Expected a bottle variant");

    expect(bottle.price_verification_status).toBe("legacy");
    expect(bottle.blockers).toContain("LEGACY_PRICE_NOT_APPROVED_FOR_PUBLICATION");
  });

  it("keeps official_pdf decant siblings individually clean regardless of the bottle's blocker (G2)", () => {
    const product = first(mixedReadinessProduct().products);
    const decants = product.variants.filter((variant) => variant.variant_kind === "decant");

    expect(decants).toHaveLength(3);
    for (const decant of decants) {
      expect(decant.price_verification_status).toBe("official_pdf");
      expect(decant.blockers).toEqual([]);
    }
  });

  it("lets the product-level blockers array report the child bottle issue as an audit rollup (G3)", () => {
    const product = first(mixedReadinessProduct().products);
    expect(product.blockers).toContain("LEGACY_PRICES_REQUIRE_COMMERCIAL_APPROVAL");
  });

  it("never treats the product-level aggregate blocker as all-variants-unpublishable (G4)", () => {
    const product = first(mixedReadinessProduct().products);
    // The aggregate rollup is non-empty (the bottle is blocked)...
    expect(product.blockers.length).toBeGreaterThan(0);
    // ...but that must not have suppressed or altered the clean decant
    // variants' own readiness: they stay individually blocker-free and
    // published-draft, independent of the product-level rollup.
    const decants = product.variants.filter((variant) => variant.variant_kind === "decant");
    expect(decants.every((variant) => variant.blockers.length === 0)).toBe(true);
    expect(decants.every((variant) => variant.publication_status === "draft")).toBe(true);
  });

  it("leaves lifecycle/archive rules unaffected by variant-level bottle blockers (G5)", () => {
    // Archiving is still governed solely by PRODUCT_LIFECYCLE_OVERRIDES
    // (Part D/Section E), not by a variant's own commercial blockers -- a
    // mixed-readiness product with no lifecycle override stays "draft".
    const product = first(mixedReadinessProduct().products);
    expect(product.target_product.publication_status).toBe("draft");
  });

  it("performs no price mutation on the remaining 13 legacy bottle variants (G6, updated for 4K-B2B.2A Batch A + 4K-B2B.2B Batch B)", () => {
    // Byte-for-byte against the committed baseline (supabase/staging/commercial-reconciliation.json):
    // every bottle price variant still at price_verification_status=legacy (13, after
    // Batch A + Batch B moved 11 of the 24 to provisional_market) keeps its exact price_amount.
    const persisted = JSON.parse(readFileSync(
      resolve(repositoryRoot, "supabase/staging/commercial-reconciliation.json"),
      "utf8",
    )) as { products: ReconciledProduct[] };
    const staging = JSON.parse(readFileSync(
      resolve(repositoryRoot, "supabase/staging/legacy-catalog-staging.json"),
      "utf8",
    )) as LegacyStaging;
    const fresh = reconcileCommercialCatalog({ staging });

    const persistedBottles = persisted.products
      .flatMap((product) => product.variants.map((variant) => ({ legacy_id: product.legacy_id, ...variant })))
      .filter((variant) => variant.variant_kind === "bottle" && variant.price_verification_status === "legacy");
    const freshBottles = fresh.products
      .flatMap((product) => product.variants.map((variant) => ({ legacy_id: product.legacy_id, ...variant })))
      .filter((variant) => variant.variant_kind === "bottle" && variant.price_verification_status === "legacy");

    expect(freshBottles).toHaveLength(13);
    expect(freshBottles.map((v) => ({ legacy_id: v.legacy_id, size_ml: v.size_ml, price_amount: v.price_amount })).sort((a, b) => stableSortKey(a) < stableSortKey(b) ? -1 : 1))
      .toEqual(persistedBottles.map((v) => ({ legacy_id: v.legacy_id, size_ml: v.size_ml, price_amount: v.price_amount })).sort((a, b) => stableSortKey(a) < stableSortKey(b) ? -1 : 1));

    function stableSortKey(v: { legacy_id: string | null; size_ml: number }) {
      return `${v.legacy_id}:${v.size_ml}`;
    }
  });
});

describe("4K-B2B.1A bottle identity audit corrections", () => {
  const staging = JSON.parse(readFileSync(
    resolve(repositoryRoot, "supabase/staging/legacy-catalog-staging.json"),
    "utf8",
  )) as LegacyStaging;
  const result = reconcileCommercialCatalog({ staging, documentedBottlePriceCount: 24 });
  const productById = (identity: string | null) =>
    result.products.find((product) => (product.legacy_id ?? product.target_product.slug) === identity);
  const bottleVariant = (product: ReconciledProduct) =>
    product.variants.find((variant) => variant.variant_kind === "bottle");

  it("adg-profondo-edp's 100 ml bottle price: the 4K-B2B.1A audit reclassification alone did not mutate the catalog (100 ml stayed SIZE_CONFIRMED); 4K-B2B.2A Batch A separately applied a provisional_market price", () => {
    const product = productById("adg-profondo-edp");
    if (!product) throw new Error("Expected adg-profondo-edp in the reconciled catalog");
    const bottle = bottleVariant(product);
    expect(bottle).toMatchObject({ size_ml: 100, price_amount: 329, price_verification_status: "provisional_market" });
  });

  it("corrects Dylan Blue's concentration to EDT; 4K-B2B.2A Batch A separately applied a provisional_market bottle price", () => {
    const product = productById("dylan-blue");
    if (!product) throw new Error("Expected dylan-blue in the reconciled catalog");
    expect(product.target_product.concentration).toBe("EDT");
    const bottle = bottleVariant(product);
    expect(bottle).toMatchObject({ size_ml: 100, price_amount: 375, price_verification_status: "provisional_market" });
  });

  it("corrects By The Fireplace's concentration to EDT with no price change", () => {
    const product = productById("by-the-fireplace");
    if (!product) throw new Error("Expected by-the-fireplace in the reconciled catalog");
    expect(product.target_product.concentration).toBe("EDT");
    const bottle = bottleVariant(product);
    expect(bottle).toMatchObject({ size_ml: 100, price_amount: 750, price_verification_status: "legacy" });
  });

  it("corrects Le Male Elixir's concentration to Parfum; 4K-B2B.2B Batch B separately applied a provisional_market bottle price", () => {
    const product = productById("le-male-elixir");
    if (!product) throw new Error("Expected le-male-elixir in the reconciled catalog");
    expect(product.target_product.concentration).toBe("Parfum");
    const bottle = bottleVariant(product);
    expect(bottle).toMatchObject({ size_ml: 75, price_amount: 464, price_verification_status: "provisional_market" });
  });

  it("leaves cdn-intense-man's, le-beau-le-parfum's, cedrat-boise-int's, m-red-tobacco's, bir-intense's and victory-elixir's source concentration/size untouched (deferred corrections, not in this gate's explicit scope)", () => {
    const deferred: Array<[string, string, number]> = [
      ["cdn-intense-man", "EDP", 105],
      ["le-beau-le-parfum", "EDP", 100],
      ["cedrat-boise-int", "EDP", 100],
      ["m-red-tobacco", "EDP", 100],
      ["bir-intense", "EDP", 100],
      ["victory-elixir", "EDP", 100],
    ];
    for (const [legacyId, concentration, sizeMl] of deferred) {
      const product = productById(legacyId);
      if (!product) throw new Error(`Expected ${legacyId} in the reconciled catalog`);
      expect(product.target_product.concentration).toBe(concentration);
      const bottle = bottleVariant(product);
      expect(bottle?.size_ml).toBe(sizeMl);
    }
  });

  it("never silently assigns a resolved target size to an unresolved multi-size bottle variant (le-beau-le-parfum, bir-intense)", () => {
    // The audit artifact records these as TARGET_SIZE_UNRESOLVED (75 vs 125 ml,
    // and an illegible client photo, respectively) -- the reconciled catalog's
    // actual bottle size_ml must stay exactly the legacy value, never silently
    // switched to one of the candidate official sizes.
    for (const legacyId of ["le-beau-le-parfum", "bir-intense"]) {
      const product = productById(legacyId);
      if (!product) throw new Error(`Expected ${legacyId} in the reconciled catalog`);
      const bottle = bottleVariant(product);
      expect(bottle?.size_ml).toBe(100);
      expect(bottle?.price_verification_status).toBe("legacy");
    }
  });

  it("keeps exactly 288 official_pdf decant prices after the concentration-only corrections (4K-B2A truth preserved)", () => {
    expect(result.summary.confirmed_price_variants).toBe(288);
    expect(result.summary.legacy_bottle_price_variants).toBe(13);
    expect(result.summary.provisional_market_bottle_price_variants).toBe(11);
    expect(result.summary.confirmed_bottle_price_variants).toBe(0);
    expect(result.summary.staged_non_combo_products).toBe(97);
    expect(result.summary.variants).toBe(315);
    expect(result.summary.blocked).toBe(3);
    expect(result.summary.conflicts).toBe(0);
  });

  it("performs no price mutation anywhere in the reconciled catalog from this gate's source edits", () => {
    const persisted = JSON.parse(readFileSync(
      resolve(repositoryRoot, "supabase/staging/commercial-reconciliation.json"),
      "utf8",
    )) as { products: ReconciledProduct[] };
    const priceOf = (products: ReconciledProduct[]) =>
      products
        .flatMap((product) => product.variants.map((variant) => ({
          legacy_id: product.legacy_id,
          label: variant.label,
          price_amount: variant.price_amount,
        })))
        .sort((a, b) => `${a.legacy_id}:${a.label}`.localeCompare(`${b.legacy_id}:${b.label}`));

    expect(priceOf(result.products)).toEqual(priceOf(persisted.products));
  });
});

describe("4K-B2B.2A Batch A Peru market price research", () => {
  const staging = JSON.parse(readFileSync(
    resolve(repositoryRoot, "supabase/staging/legacy-catalog-staging.json"),
    "utf8",
  )) as LegacyStaging;
  const result = reconcileCommercialCatalog({ staging, documentedBottlePriceCount: 24 });
  const productById = (identity: string | null) =>
    result.products.find((product) => (product.legacy_id ?? product.target_product.slug) === identity);
  const bottleVariant = (product: ReconciledProduct) =>
    product.variants.find((variant) => variant.variant_kind === "bottle");

  const appliedTargets: Array<[string, number]> = [
    ["9pm", 206],
    ["adg-profondo-edp", 329],
    ["asad-elixir", 168],
    ["b-man-in-black", 535],
    ["dylan-blue", 375],
    ["eros-edt", 375],
  ];
  const lowConfidenceTargets = ["1-million-lucky", "by-the-fireplace"];

  it("(1) every applied Batch A market price targets the bottle variant only, never a decant", () => {
    for (const [legacyId] of appliedTargets) {
      const product = productById(legacyId);
      if (!product) throw new Error(`Expected ${legacyId} in the reconciled catalog`);
      const provisionalVariants = product.variants.filter((variant) => variant.price_verification_status === "provisional_market");
      expect(provisionalVariants.length).toBeGreaterThan(0);
      expect(provisionalVariants.every((variant) => variant.variant_kind === "bottle")).toBe(true);
    }
  });

  it("(2)+(3) every applied Batch A market price is provisional_market, and none becomes official_pdf/client_confirmed", () => {
    for (const [legacyId, priceAmount] of appliedTargets) {
      const product = productById(legacyId);
      if (!product) throw new Error(`Expected ${legacyId} in the reconciled catalog`);
      const bottle = bottleVariant(product);
      expect(bottle).toMatchObject({ size_ml: 100, price_amount: priceAmount, price_verification_status: "provisional_market" });
      expect(bottle?.price_verification_status).not.toBe("official_pdf");
      expect(bottle?.price_verification_status).not.toBe("client_confirmed");
      expect(bottle?.blockers).toContain("PROVISIONAL_MARKET_PRICE_REQUIRES_COMMERCIAL_APPROVAL");
    }
  });

  it("(4) all 288 decant official_pdf variants remain untouched by Batch A", () => {
    const decantVariants = result.products.flatMap((product) => product.variants).filter((variant) => variant.variant_kind === "decant");
    const officialPdfDecants = decantVariants.filter((variant) => variant.price_verification_status === "official_pdf");
    expect(officialPdfDecants).toHaveLength(288);
  });

  it("(5) each researched legacy_id gets at most one override for the target size (no duplicate/no double-application)", () => {
    const batchALegacyIds = [...appliedTargets.map(([legacyId]) => legacyId), ...lowConfidenceTargets];
    const overridesForBatchA = VARIANT_PRICE_OVERRIDES.filter(
      (override) => override.variant_kind === "bottle" && batchALegacyIds.includes(override.legacy_id ?? ""),
    );
    expect(overridesForBatchA).toHaveLength(appliedTargets.length);
    const keys = overridesForBatchA.map((override) => `${override.legacy_id}:${override.variant_kind}:${override.size_ml}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("(6) LOW-confidence/unresolved Batch A items (1-million-lucky, by-the-fireplace) stay unchanged at legacy", () => {
    for (const legacyId of lowConfidenceTargets) {
      const product = productById(legacyId);
      if (!product) throw new Error(`Expected ${legacyId} in the reconciled catalog`);
      const bottle = bottleVariant(product);
      expect(bottle?.price_verification_status).toBe("legacy");
      const hasOverride = VARIANT_PRICE_OVERRIDES.some((override) => override.legacy_id === legacyId && override.variant_kind === "bottle");
      expect(hasOverride).toBe(false);
    }
  });

  it("(7) product lifecycle states remain unchanged by Batch A", () => {
    for (const [legacyId] of appliedTargets) {
      const product = productById(legacyId);
      if (!product) throw new Error(`Expected ${legacyId} in the reconciled catalog`);
      expect(product.target_product.publication_status).toBe("draft");
    }
  });

  it("(8) archived Invictus (invictus-elixir) remains archived after Batch A", () => {
    const product = productById("invictus-elixir");
    if (!product) throw new Error("Expected invictus-elixir in the reconciled catalog");
    expect(product.target_product.publication_status).toBe("archived");
  });

  it("(9) BIR Intense (bir-intense) is untouched by Batch A (not a Batch A target; stays draft, legacy bottle price)", () => {
    const product = productById("bir-intense");
    if (!product) throw new Error("Expected bir-intense in the reconciled catalog");
    expect(product.target_product.publication_status).toBe("draft");
    const bottle = bottleVariant(product);
    expect(bottle?.price_verification_status).toBe("legacy");
  });

  it("(10) B2B.1 variant-readiness isolation remains true: a provisional_market bottle blocker never appears on that product's decant rows", () => {
    for (const [legacyId] of appliedTargets) {
      const product = productById(legacyId);
      if (!product) throw new Error(`Expected ${legacyId} in the reconciled catalog`);
      const decants = product.variants.filter((variant) => variant.variant_kind === "decant");
      for (const decant of decants) {
        expect(decant.blockers).not.toContain("PROVISIONAL_MARKET_PRICE_REQUIRES_COMMERCIAL_APPROVAL");
      }
    }
  });

  it("summary.provisional_market_bottle_price_variants is exactly 11 after Batch A + Batch B (the shared research artifact now carries both)", () => {
    expect(result.summary.provisional_market_bottle_price_variants).toBe(11);
    expect(result.summary.legacy_bottle_price_variants).toBe(13);
  });
});

describe("4K-B2B.2B Batch B Peru market price research", () => {
  const staging = JSON.parse(readFileSync(
    resolve(repositoryRoot, "supabase/staging/legacy-catalog-staging.json"),
    "utf8",
  )) as LegacyStaging;
  const result = reconcileCommercialCatalog({ staging, documentedBottlePriceCount: 24 });
  const productById = (identity: string | null) =>
    result.products.find((product) => (product.legacy_id ?? product.target_product.slug) === identity);
  const bottleVariants = (product: ReconciledProduct) =>
    product.variants.filter((variant) => variant.variant_kind === "bottle");

  // Batch A's 6 targets (all single-size) untouched by Batch B.
  const batchATargets: Array<[string, number]> = [
    ["9pm", 206],
    ["adg-profondo-edp", 329],
    ["asad-elixir", 168],
    ["b-man-in-black", 535],
    ["dylan-blue", 375],
    ["eros-edt", 375],
  ];

  // Batch B applied targets: [legacyId, sizeMl, priceAmount].
  const batchBApplied: Array<[string, number, number]> = [
    ["erba-pura", 50, 667],
    ["erba-pura", 100, 919],
    ["hawas-ice", 100, 200],
    ["le-male-elixir", 75, 464],
    ["sauvage-edt", 100, 414],
  ];
  const batchBLowConfidence: Array<[string, number]> = [
    ["khamrah-clasico", 100],
    ["liquid-brun", 100],
    ["spicebomb-extreme", 90],
  ];

  it("(1) every applied Batch B market price targets the bottle variant at the exact researched size only, never a decant", () => {
    for (const [legacyId, sizeMl, priceAmount] of batchBApplied) {
      const product = productById(legacyId);
      if (!product) throw new Error(`Expected ${legacyId} in the reconciled catalog`);
      const bottle = bottleVariants(product).find((variant) => variant.size_ml === sizeMl);
      expect(bottle).toBeDefined();
      expect(bottle).toMatchObject({ price_amount: priceAmount, price_verification_status: "provisional_market" });
      expect(bottle?.blockers).toContain("PROVISIONAL_MARKET_PRICE_REQUIRES_COMMERCIAL_APPROVAL");
    }
  });

  it("(2)+(3) every applied Batch B market price is provisional_market, and none becomes official_pdf/client_confirmed", () => {
    for (const [legacyId, sizeMl] of batchBApplied.map(([id, size]) => [id, size] as [string, number])) {
      const product = productById(legacyId);
      if (!product) throw new Error(`Expected ${legacyId} in the reconciled catalog`);
      const bottle = bottleVariants(product).find((variant) => variant.size_ml === sizeMl);
      expect(bottle?.price_verification_status).toBe("provisional_market");
      expect(bottle?.price_verification_status).not.toBe("official_pdf");
      expect(bottle?.price_verification_status).not.toBe("client_confirmed");
    }
  });

  it("(3) Erba Pura 50 ml and 100 ml are distinct override keys with distinct prices, never merged into one row", () => {
    const product = productById("erba-pura");
    if (!product) throw new Error("Expected erba-pura in the reconciled catalog");
    const bottles = bottleVariants(product);
    expect(bottles).toHaveLength(2);
    const fifty = bottles.find((variant) => variant.size_ml === 50);
    const hundred = bottles.find((variant) => variant.size_ml === 100);
    expect(fifty).toMatchObject({ price_amount: 667, price_verification_status: "provisional_market" });
    expect(hundred).toMatchObject({ price_amount: 919, price_verification_status: "provisional_market" });
    expect(fifty?.price_amount).not.toBe(hundred?.price_amount);
  });

  it("(4) Batch A provisional_market values are unchanged by Batch B", () => {
    for (const [legacyId, priceAmount] of batchATargets) {
      const product = productById(legacyId);
      if (!product) throw new Error(`Expected ${legacyId} in the reconciled catalog`);
      const bottle = bottleVariants(product)[0];
      expect(bottle).toMatchObject({ price_amount: priceAmount, price_verification_status: "provisional_market" });
    }
  });

  it("(5) all 288 decant official_pdf variants remain untouched by Batch B", () => {
    const decantVariants = result.products.flatMap((product) => product.variants).filter((variant) => variant.variant_kind === "decant");
    const officialPdfDecants = decantVariants.filter((variant) => variant.price_verification_status === "official_pdf");
    expect(officialPdfDecants).toHaveLength(288);
  });

  it("(6) LOW-confidence/unresolved Batch B targets (khamrah-clasico, liquid-brun, spicebomb-extreme) stay unchanged at legacy", () => {
    for (const [legacyId, sizeMl] of batchBLowConfidence) {
      const product = productById(legacyId);
      if (!product) throw new Error(`Expected ${legacyId} in the reconciled catalog`);
      const bottle = bottleVariants(product).find((variant) => variant.size_ml === sizeMl);
      expect(bottle?.price_verification_status).toBe("legacy");
      const hasOverride = VARIANT_PRICE_OVERRIDES.some(
        (override) => override.legacy_id === legacyId && override.variant_kind === "bottle" && override.size_ml === sizeMl,
      );
      expect(hasOverride).toBe(false);
    }
  });

  it("(7) product lifecycle states remain unchanged by Batch B", () => {
    for (const [legacyId] of batchBApplied) {
      const product = productById(legacyId);
      if (!product) throw new Error(`Expected ${legacyId} in the reconciled catalog`);
      expect(product.target_product.publication_status).toBe("draft");
    }
  });

  it("(8) the explicit Admin confirmation workflow (4K-B2B.2A.1) is still valid for a Batch B provisional_market variant: a numeric-only edit stays provisional_market, and only an explicit client-confirmed flag promotes it, same variant identity, no duplicate", () => {
    const product = productById("sauvage-edt");
    if (!product) throw new Error("Expected sauvage-edt in the reconciled catalog");
    const bottle = bottleVariants(product).find((variant) => variant.size_ml === 100);
    expect(bottle?.price_verification_status).toBe("provisional_market");
    // The RPC-level explicit-confirmation contract itself is exercised by the
    // pgTAP suite (supabase/tests) and was not modified in this gate (Part
    // 11: "Do not alter RPC again unless an actual regression is
    // discovered"); this test asserts the reconciliation-layer precondition
    // that Batch B rows are provisional_market (not already client_confirmed
    // or duplicated) going into that workflow.
    const overridesForThisVariant = VARIANT_PRICE_OVERRIDES.filter(
      (override) => override.legacy_id === "sauvage-edt" && override.variant_kind === "bottle" && override.size_ml === 100,
    );
    expect(overridesForThisVariant).toHaveLength(1);
  });

  it("(9) no duplicate override keys exist for any Batch A or Batch B legacy_id + size_ml", () => {
    const bottleOverrides = VARIANT_PRICE_OVERRIDES.filter((override) => override.variant_kind === "bottle");
    const keys = bottleOverrides.map((override) => `${override.legacy_id}:${override.size_ml}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(bottleOverrides).toHaveLength(11);
  });

  it("(10) the commercial artifact is deterministic: reconciling twice from the same staging + research inputs yields byte-identical serialized output", () => {
    const again = reconcileCommercialCatalog({ staging, documentedBottlePriceCount: 24 });
    expect(serializeCommercialReconciliation(result)).toEqual(serializeCommercialReconciliation(again));
  });

  it("summary.provisional_market_bottle_price_variants is exactly 11 (6 Batch A + 5 Batch B)", () => {
    expect(result.summary.provisional_market_bottle_price_variants).toBe(11);
    expect(result.summary.legacy_bottle_price_variants).toBe(13);
  });
});
