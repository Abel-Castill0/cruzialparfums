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
      staged_non_combo_products: 100,
      variants: 324,
      blocked: 0,
      conflicts: 0,
    });
    expect(result.blocked).toHaveLength(0);
    expect(result.conflicts).toEqual([]);
    expect(result.category_targets).toHaveLength(11);
    expect(result.category_targets).toContainEqual(expect.objectContaining({
      kind: "commercial_type",
      slug: "arabic",
      name: "Árabe",
      publication_status: "draft",
    }));
  });

  it("keeps every variant draft, and every bottle price legacy/provisional_market and never confirmed (4K-B2A Part H, 4K-B2B.2A/2B/2C)", () => {
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
    // 4K-B2B.3, 20 of the 24 (6 Batch A + 5 Batch B + 6 Batch C + 3 4K-B2B.3
    // closure promotions: khamrah-clasico, liquid-brun, victory-elixir) carry an
    // operator-authorized provisional_market price instead of legacy — still
    // never official_pdf/client_confirmed.
    expect(bottleVariants).toHaveLength(24);
    expect(bottleVariants.every((variant) => variant.price_verification_status === "legacy" || variant.price_verification_status === "provisional_market")).toBe(true);
    expect(result.summary.legacy_bottle_price_variants).toBe(4);
    expect(result.summary.provisional_market_bottle_price_variants).toBe(20);
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

  it("materializes official-PDF-confirmed combo composition and price for all 3 combos (8)", () => {
    const expected: Record<string, { members: string[]; price: number[] }> = {
      "combo-cuarteto": { members: ["khamrah-qahwa", "khamrah-clasico", "khamrah-waha", "khamrah-dukhan"], price: [40, 55, 89] },
      "combo-vainilla": { members: ["yara-pink", "yara-candy", "eclaire"], price: [27, 39, 65] },
      "combo-tulum": { members: ["odyssey-aqua", "hawas-tropical", "supremacy-colle"], price: [31, 42, 71] },
    };
    for (const [legacyId, { members, price }] of Object.entries(expected)) {
      const product = productById(legacyId);
      const target = result.combo_targets?.find((combo) => combo.product.legacy_id === legacyId);
      if (!product || !target) throw new Error(`Expected materialized ${legacyId}`);
      expect(product.variants.map((variant) => variant.price_amount)).toEqual(price);
      expect(product.variants.every((variant) => variant.price_verification_status === "official_pdf")).toBe(true);
      expect(target.composition_verification_status).toBe("official_pdf");
      expect(target.presentations[0]?.items.map((item) => item.product.legacy_id)).toEqual(members);
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
    // 285 official_pdf decant overrides (4K-B2A) + 20 provisional_market bottle
    // overrides (6 Batch A + 5 Batch B + 6 Batch C + 3 4K-B2B.3 closure
    // promotions) applied from supabase/staging/bottle-market-research.json
    // (4K-B2B.2A + 4K-B2B.2B + 4K-B2B.2C + 4K-B2B.3).
    expect(VARIANT_PRICE_OVERRIDES).toHaveLength(305);
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

  it("performs no price mutation on the remaining 4 legacy bottle variants (G6, updated for 4K-B2B.2A Batch A + 4K-B2B.2B Batch B + 4K-B2B.2C Batch C + 4K-B2B.3 closure)", () => {
    // Byte-for-byte against the committed baseline (supabase/staging/commercial-reconciliation.json):
    // every bottle price variant still at price_verification_status=legacy (4, after
    // Batch A + Batch B + Batch C + 4K-B2B.3 moved 20 of the 24 to provisional_market) keeps its exact price_amount.
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

    expect(freshBottles).toHaveLength(4);
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

  it("leaves le-beau-le-parfum's, bir-intense's and victory-elixir's source concentration/size untouched (still deferred corrections, not in this gate's explicit scope); cdn-intense-man/cedrat-boise-int/m-red-tobacco were resolved by 4K-B2B.2C (see dedicated Batch C tests below)", () => {
    const deferred: Array<[string, string, number]> = [
      ["le-beau-le-parfum", "EDP", 100],
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

  it("keeps 288 individual official_pdf decants and adds exactly 9 official combo selling variants", () => {
    expect(result.summary.confirmed_price_variants).toBe(297);
    expect(result.summary.legacy_bottle_price_variants).toBe(4);
    expect(result.summary.provisional_market_bottle_price_variants).toBe(20);
    expect(result.summary.confirmed_bottle_price_variants).toBe(0);
    expect(result.summary.staged_non_combo_products).toBe(100);
    expect(result.summary.variants).toBe(324);
    expect(result.summary.blocked).toBe(0);
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
    expect(officialPdfDecants).toHaveLength(297);
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

  it("summary.provisional_market_bottle_price_variants is exactly 20 after Batch A + Batch B + Batch C + 4K-B2B.3 closure (the shared research artifact now carries all of them)", () => {
    expect(result.summary.provisional_market_bottle_price_variants).toBe(20);
    expect(result.summary.legacy_bottle_price_variants).toBe(4);
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
  // spicebomb-extreme was originally a Batch B LOW-confidence/unresolved
  // target but was upgraded to MEDIUM/provisional_market by 4K-B2B.2C (see
  // the dedicated "4K-B2B.2C Batch C" describe block below) — it is
  // deliberately excluded from this "stays legacy" list so this test keeps
  // describing current behavior rather than asserting something Batch C
  // intentionally changed.
  //
  // khamrah-clasico and liquid-brun were originally Batch B LOW-confidence/
  // unresolved targets but were upgraded to MEDIUM/provisional_market by
  // 4K-B2B.3 reviewer-approved decisions (see the dedicated "4K-B2B.3"
  // describe block below) — likewise excluded here.
  const batchBLowConfidence: Array<[string, number]> = [];

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
    expect(officialPdfDecants).toHaveLength(297);
  });

  it("(6) LOW-confidence/unresolved Batch B targets (none remain as of 4K-B2B.3 — khamrah-clasico/liquid-brun/spicebomb-extreme were all since upgraded) stay unchanged at legacy", () => {
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

  it("(9) no duplicate override keys exist for any Batch A, Batch B, Batch C, or 4K-B2B.3 legacy_id + size_ml", () => {
    const bottleOverrides = VARIANT_PRICE_OVERRIDES.filter((override) => override.variant_kind === "bottle");
    const keys = bottleOverrides.map((override) => `${override.legacy_id}:${override.size_ml}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(bottleOverrides).toHaveLength(20);
  });

  it("(10) the commercial artifact is deterministic: reconciling twice from the same staging + research inputs yields byte-identical serialized output", () => {
    const again = reconcileCommercialCatalog({ staging, documentedBottlePriceCount: 24 });
    expect(serializeCommercialReconciliation(result)).toEqual(serializeCommercialReconciliation(again));
  });

  it("summary.provisional_market_bottle_price_variants is exactly 20 (6 Batch A + 5 Batch B + 6 Batch C + 3 4K-B2B.3 closure promotions, since the shared research artifact carries all closure entries)", () => {
    expect(result.summary.provisional_market_bottle_price_variants).toBe(20);
    expect(result.summary.legacy_bottle_price_variants).toBe(4);
  });
});

describe("4K-B2B.2C Batch C Peru market price research", () => {
  const staging = JSON.parse(readFileSync(
    resolve(repositoryRoot, "supabase/staging/legacy-catalog-staging.json"),
    "utf8",
  )) as LegacyStaging;
  const result = reconcileCommercialCatalog({ staging, documentedBottlePriceCount: 24 });
  const productById = (identity: string | null) =>
    result.products.find((product) => (product.legacy_id ?? product.target_product.slug) === identity);
  const bottleVariants = (product: ReconciledProduct) =>
    product.variants.filter((variant) => variant.variant_kind === "bottle");

  // Batch A + Batch B targets untouched by Batch C.
  const priorBatchesApplied: Array<[string, number, number]> = [
    ["9pm", 100, 206],
    ["adg-profondo-edp", 100, 329],
    ["asad-elixir", 100, 168],
    ["b-man-in-black", 100, 535],
    ["dylan-blue", 100, 375],
    ["eros-edt", 100, 375],
    ["erba-pura", 50, 667],
    ["erba-pura", 100, 919],
    ["hawas-ice", 100, 200],
    ["le-male-elixir", 75, 464],
    ["sauvage-edt", 100, 414],
  ];

  // Batch C new applied targets: [legacyId, sizeMl, priceAmount].
  const batchCApplied: Array<[string, number, number]> = [
    ["cdn-intense-man", 105, 207],
    ["cedrat-boise-int", 120, 614],
    ["m-red-tobacco", 120, 609],
    ["tmw-parfum", 100, 407],
    ["ultra-male", 125, 405],
  ];
  // spicebomb-extreme: prior LOW (Batch B), upgraded to MEDIUM/provisional_market by Batch C.
  const batchCUpgraded: [string, number, number] = ["spicebomb-extreme", 90, 598];
  const batchCLowConfidenceUnchanged = ["1-million-lucky", "by-the-fireplace"];

  it("(1) all eight exact Batch-C targets resolve to a unique legacy_id + size_ml row (no collisions)", () => {
    const allEight = [...batchCApplied, batchCUpgraded, ...batchCLowConfidenceUnchanged.map((id) => [id, null, null] as const)];
    const keys = allEight.map(([legacyId]) => legacyId);
    expect(new Set(keys).size).toBe(8);
    for (const [legacyId, sizeMl] of batchCApplied) {
      const product = productById(legacyId);
      if (!product) throw new Error(`Expected ${legacyId} in the reconciled catalog`);
      const matching = bottleVariants(product).filter((variant) => variant.size_ml === sizeMl);
      expect(matching).toHaveLength(1);
    }
  });

  it("(2)+(7) every applied Batch C market price targets the bottle variant at the exact researched size, is provisional_market, and never official_pdf/client_confirmed", () => {
    for (const [legacyId, sizeMl, priceAmount] of [...batchCApplied, batchCUpgraded]) {
      const product = productById(legacyId);
      if (!product) throw new Error(`Expected ${legacyId} in the reconciled catalog`);
      const bottle = bottleVariants(product).find((variant) => variant.size_ml === sizeMl);
      expect(bottle).toMatchObject({ price_amount: priceAmount, price_verification_status: "provisional_market" });
      expect(bottle?.price_verification_status).not.toBe("official_pdf");
      expect(bottle?.price_verification_status).not.toBe("client_confirmed");
      expect(bottle?.blockers).toContain("PROVISIONAL_MARKET_PRICE_REQUIRES_COMMERCIAL_APPROVAL");
    }
  });

  it("(3)+(4) CDN Intense Man becomes EDT with no size change, and its bottle price is a provisional_market override", () => {
    const product = productById("cdn-intense-man");
    if (!product) throw new Error("Expected cdn-intense-man in the reconciled catalog");
    expect(product.target_product.concentration).toBe("EDT");
    const bottle = bottleVariants(product).find((variant) => variant.size_ml === 105);
    expect(bottle).toMatchObject({ size_ml: 105, price_amount: 207, price_verification_status: "provisional_market" });
  });

  it("(4) Cedrat Boise Intense's current bottle target is 120 ml (corrected from the legacy 100 ml key), priced by fresh research, not the old 100ml legacy number", () => {
    const product = productById("cedrat-boise-int");
    if (!product) throw new Error("Expected cedrat-boise-int in the reconciled catalog");
    const bottles = bottleVariants(product);
    expect(bottles).toHaveLength(1);
    expect(bottles[0].size_ml).toBe(120);
    expect(bottles[0].price_amount).toBe(614);
    expect(bottles[0].price_amount).not.toBe(820); // the old 100ml legacy number must never be reused as-is for 120ml
    expect(bottles[0].price_verification_status).toBe("provisional_market");
  });

  it("(5) Red Tobacco's current bottle target is 120 ml (corrected from the legacy 100 ml key), priced by fresh research, not the old 100ml legacy number", () => {
    const product = productById("m-red-tobacco");
    if (!product) throw new Error("Expected m-red-tobacco in the reconciled catalog");
    const bottles = bottleVariants(product);
    expect(bottles).toHaveLength(1);
    expect(bottles[0].size_ml).toBe(120);
    expect(bottles[0].price_amount).toBe(609);
    expect(bottles[0].price_amount).not.toBe(850); // the old 100ml legacy number must never be reused as-is for 120ml
    expect(bottles[0].price_verification_status).toBe("provisional_market");
  });

  it("(6) the old 100ml legacy prices (820 Cedrat Boise, 850 Red Tobacco) are not silently reclassified as market-confirmed anywhere in the reconciled catalog", () => {
    const allBottleVariants = result.products.flatMap((product) => product.variants).filter((variant) => variant.variant_kind === "bottle");
    const stale820or850AsConfirmed = allBottleVariants.filter(
      (variant) => (variant.price_amount === 820 || variant.price_amount === 850)
        && (variant.price_verification_status === "provisional_market" || variant.price_verification_status === "official_pdf" || variant.price_verification_status === "client_confirmed"),
    );
    expect(stale820or850AsConfirmed).toHaveLength(0);
  });

  it("(6R) 4K-B2B.2C-R reviewer correction: Ultra Male is 125 ml / EDT / S/405 / provisional_market, and the superseded unavailable S/509 observations are not the selected current reference anywhere in the reconciled catalog", () => {
    const product = productById("ultra-male");
    if (!product) throw new Error("Expected ultra-male in the reconciled catalog");
    const bottle = bottleVariants(product).find((variant) => variant.size_ml === 125);
    expect(bottle).toMatchObject({ price_amount: 405, price_verification_status: "provisional_market" });
    expect(bottle?.price_amount).not.toBe(509);

    const allBottleVariants = result.products.flatMap((p) => p.variants).filter((variant) => variant.variant_kind === "bottle");
    const stale509AsConfirmed = allBottleVariants.filter(
      (variant) => variant.price_amount === 509
        && (variant.price_verification_status === "provisional_market" || variant.price_verification_status === "official_pdf" || variant.price_verification_status === "client_confirmed"),
    );
    expect(stale509AsConfirmed).toHaveLength(0);
  });

  it("(8) Batch A + Batch B provisional_market values remain unchanged by Batch C", () => {
    for (const [legacyId, sizeMl, priceAmount] of priorBatchesApplied) {
      const product = productById(legacyId);
      if (!product) throw new Error(`Expected ${legacyId} in the reconciled catalog`);
      const bottle = bottleVariants(product).find((variant) => variant.size_ml === sizeMl);
      expect(bottle).toMatchObject({ price_amount: priceAmount, price_verification_status: "provisional_market" });
    }
  });

  it("(9) prior LOW upgrade: spicebomb-extreme moves from legacy to provisional_market, preserving its prior LOW evidence in the research artifact", () => {
    const product = productById("spicebomb-extreme");
    if (!product) throw new Error("Expected spicebomb-extreme in the reconciled catalog");
    const bottle = bottleVariants(product).find((variant) => variant.size_ml === 90);
    expect(bottle).toMatchObject({ price_amount: 598, price_verification_status: "provisional_market" });

    const research = JSON.parse(readFileSync(
      resolve(repositoryRoot, "supabase/staging/bottle-market-research.json"),
      "utf8",
    )) as { entries: Array<{ legacy_id: string; confidence: string; prior_confidence?: string; observations: unknown[] }> };
    const entry = research.entries.find((e) => e.legacy_id === "spicebomb-extreme");
    if (!entry) throw new Error("Expected spicebomb-extreme in the research artifact");
    expect(entry.prior_confidence).toBe("LOW");
    expect(entry.confidence).toBe("MEDIUM");
    // The original Falabella-only observation is preserved, not erased, alongside the new one.
    expect(entry.observations.length).toBeGreaterThanOrEqual(2);
  });

  it("(10) LOW-confidence/unresolved Batch C re-attempts (1-million-lucky, by-the-fireplace) stay unchanged at legacy", () => {
    for (const legacyId of batchCLowConfidenceUnchanged) {
      const product = productById(legacyId);
      if (!product) throw new Error(`Expected ${legacyId} in the reconciled catalog`);
      const bottle = bottleVariants(product)[0];
      expect(bottle?.price_verification_status).toBe("legacy");
      const hasOverride = VARIANT_PRICE_OVERRIDES.some((override) => override.legacy_id === legacyId && override.variant_kind === "bottle");
      expect(hasOverride).toBe(false);
    }
  });

  it("(11) all 288 decant official_pdf variants remain untouched by Batch C", () => {
    const decantVariants = result.products.flatMap((product) => product.variants).filter((variant) => variant.variant_kind === "decant");
    const officialPdfDecants = decantVariants.filter((variant) => variant.price_verification_status === "official_pdf");
    expect(officialPdfDecants).toHaveLength(297);
  });

  it("(12) the explicit Admin confirmation workflow (4K-B2B.2A.1) remains valid for a Batch C provisional_market variant: same variant identity, no duplicate", () => {
    const overridesForThisVariant = VARIANT_PRICE_OVERRIDES.filter(
      (override) => override.legacy_id === "tmw-parfum" && override.variant_kind === "bottle" && override.size_ml === 100,
    );
    expect(overridesForThisVariant).toHaveLength(1);
    expect(overridesForThisVariant[0].price_verification_status).toBe("provisional_market");
  });

  it("(13) product lifecycle states remain unchanged by Batch C", () => {
    for (const [legacyId] of batchCApplied) {
      const product = productById(legacyId);
      if (!product) throw new Error(`Expected ${legacyId} in the reconciled catalog`);
      expect(product.target_product.publication_status).toBe("draft");
    }
  });

  it("(14) no duplicate override keys exist across Batch A, Batch B, Batch C, and 4K-B2B.3 combined", () => {
    const bottleOverrides = VARIANT_PRICE_OVERRIDES.filter((override) => override.variant_kind === "bottle");
    const keys = bottleOverrides.map((override) => `${override.legacy_id}:${override.size_ml}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(bottleOverrides).toHaveLength(20);
  });

  it("summary.provisional_market_bottle_price_variants is exactly 20 and legacy_bottle_price_variants is exactly 4 after Batch C + 4K-B2B.3 closure", () => {
    expect(result.summary.provisional_market_bottle_price_variants).toBe(20);
    expect(result.summary.legacy_bottle_price_variants).toBe(4);
  });
});

describe("4K-B2B.3 bottle market research closure (reviewer decisions)", () => {
  const staging = JSON.parse(readFileSync(
    resolve(repositoryRoot, "supabase/staging/legacy-catalog-staging.json"),
    "utf8",
  )) as LegacyStaging;
  const result = reconcileCommercialCatalog({ staging, documentedBottlePriceCount: 24 });
  const productById = (identity: string | null) =>
    result.products.find((product) => (product.legacy_id ?? product.target_product.slug) === identity);
  const bottleVariants = (product: ReconciledProduct) =>
    product.variants.filter((variant) => variant.variant_kind === "bottle");

  it("Khamrah 100ml is S/243 provisional_market", () => {
    const product = productById("khamrah-clasico");
    if (!product) throw new Error("Expected khamrah-clasico in the reconciled catalog");
    const bottle = bottleVariants(product).find((variant) => variant.size_ml === 100);
    expect(bottle).toMatchObject({ price_amount: 243, price_verification_status: "provisional_market" });
  });

  it("Liquid Brun 100ml is S/180 provisional_market", () => {
    const product = productById("liquid-brun");
    if (!product) throw new Error("Expected liquid-brun in the reconciled catalog");
    const bottle = bottleVariants(product).find((variant) => variant.size_ml === 100);
    expect(bottle).toMatchObject({ price_amount: 180, price_verification_status: "provisional_market" });
  });

  it("Victory Elixir 100ml is S/564 provisional_market", () => {
    const product = productById("victory-elixir");
    if (!product) throw new Error("Expected victory-elixir in the reconciled catalog");
    const bottle = bottleVariants(product).find((variant) => variant.size_ml === 100);
    expect(bottle).toMatchObject({ price_amount: 564, price_verification_status: "provisional_market" });
  });

  it("Victory Elixir and archived invictus-elixir remain separate", () => {
    const victory = productById("victory-elixir");
    const invictus = productById("invictus-elixir");
    if (!victory) throw new Error("Expected victory-elixir in the reconciled catalog");
    if (!invictus) throw new Error("Expected invictus-elixir in the reconciled catalog (archived, not deleted)");
    expect(victory.legacy_id).not.toBe(invictus.legacy_id);
    expect(invictus.target_product.publication_status).toBe("archived");
    expect(bottleVariants(victory)).toHaveLength(1);
    expect(bottleVariants(invictus)).toHaveLength(0);
  });

  it("exactly 20 bottle provisional_market and exactly 4 bottle legacy/unresolved", () => {
    const allBottleVariants = result.products.flatMap((product) => product.variants).filter((variant) => variant.variant_kind === "bottle");
    expect(allBottleVariants.filter((variant) => variant.price_verification_status === "provisional_market")).toHaveLength(20);
    expect(allBottleVariants.filter((variant) => variant.price_verification_status === "legacy")).toHaveLength(4);
  });

  it("the four unresolved identities are exactly 1-million-lucky, by-the-fireplace, le-beau-le-parfum, bir-intense", () => {
    const expectedUnresolved = ["1-million-lucky", "by-the-fireplace", "le-beau-le-parfum", "bir-intense"];
    for (const legacyId of expectedUnresolved) {
      const product = productById(legacyId);
      if (!product) throw new Error(`Expected ${legacyId} in the reconciled catalog`);
      const bottle = bottleVariants(product)[0];
      expect(bottle?.price_verification_status).toBe("legacy");
    }
    const allBottleVariants = result.products.flatMap((product) => product.variants).filter((variant) => variant.variant_kind === "bottle");
    const legacyProducts = result.products.filter((product) =>
      bottleVariants(product).some((variant) => variant.price_verification_status === "legacy"),
    );
    expect(legacyProducts.map((product) => product.legacy_id ?? product.target_product.slug).sort()).toEqual([...expectedUnresolved].sort());
    expect(allBottleVariants.filter((variant) => variant.price_verification_status === "legacy")).toHaveLength(expectedUnresolved.length);
  });

  it("288 individual decants plus 9 combo selling variants are official_pdf", () => {
    const decantVariants = result.products.flatMap((product) => product.variants).filter((variant) => variant.variant_kind === "decant");
    const officialPdfDecants = decantVariants.filter((variant) => variant.price_verification_status === "official_pdf");
    expect(officialPdfDecants).toHaveLength(297);
  });

  it("no duplicate bottle override keys exist", () => {
    const bottleOverrides = VARIANT_PRICE_OVERRIDES.filter((override) => override.variant_kind === "bottle");
    const keys = bottleOverrides.map((override) => `${override.legacy_id}:${override.size_ml}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("the existing Admin provisional -> client_confirmed workflow remains unaffected for a 4K-B2B.3-promoted variant", () => {
    const overridesForThisVariant = VARIANT_PRICE_OVERRIDES.filter(
      (override) => override.legacy_id === "victory-elixir" && override.variant_kind === "bottle" && override.size_ml === 100,
    );
    expect(overridesForThisVariant).toHaveLength(1);
    expect(overridesForThisVariant[0].price_verification_status).toBe("provisional_market");
    const bottle = bottleVariants(productById("victory-elixir")!)[0];
    expect(bottle.blockers).toContain("PROVISIONAL_MARKET_PRICE_REQUIRES_COMMERCIAL_APPROVAL");
  });
});

describe("4K-C2 official combo materialization", () => {
  const committedStaging = JSON.parse(readFileSync(
    resolve(repositoryRoot, "supabase/staging/legacy-catalog-staging.json"),
    "utf8",
  )) as LegacyStaging;

  const run = (staging: LegacyStaging) => reconcileCommercialCatalog({
    staging,
    documentedBottlePriceCount: 24,
  });
  const comboEntry = (staging: LegacyStaging, legacyId: string) => {
    const entry = staging.entries?.find((candidate) => candidate.legacy_id === legacyId);
    if (!entry?.combo) throw new Error(`Expected staged combo ${legacyId}`);
    return entry;
  };
  const productEntry = (staging: LegacyStaging, legacyId: string) => {
    const entry = staging.entries?.find((candidate) => candidate.legacy_id === legacyId);
    if (!entry) throw new Error(`Expected staged product ${legacyId}`);
    return entry;
  };

  it("emits exactly 3 targets, 9 presentations, and 30 deterministic quantity-one items", () => {
    const result = run(committedStaging);
    const targets = result.combo_targets ?? [];
    const presentations = targets.flatMap((combo) => combo.presentations);
    const items = presentations.flatMap((presentation) => presentation.items);

    expect(targets).toHaveLength(3);
    expect(presentations).toHaveLength(9);
    expect(items).toHaveLength(30);
    expect(items.every((item) => item.quantity === 1)).toBe(true);
    for (const presentation of presentations) {
      expect(presentation.items.every((item) => item.variant.size_ml === presentation.variant.size_ml)).toBe(true);
      expect(presentation.items.map((item) => item.sort_order)).toEqual(
        presentation.items.map((_, index) => index),
      );
    }
  });

  it("promotes the exact three official combo price sets while keeping every combo draft", () => {
    const result = run(committedStaging);
    const expected: Record<string, number[]> = {
      "combo-cuarteto": [40, 55, 89],
      "combo-vainilla": [27, 39, 65],
      "combo-tulum": [31, 42, 71],
    };

    for (const [legacyId, prices] of Object.entries(expected)) {
      const product = result.products.find((candidate) => candidate.legacy_id === legacyId);
      expect(product?.target_product.publication_status).toBe("draft");
      expect(product?.variants.map((variant) => variant.price_amount)).toEqual(prices);
      expect(product?.variants.every((variant) => variant.price_verification_status === "official_pdf")).toBe(true);
    }
    expect(result.blocked).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it("preserves all pre-C2 authority and lifecycle invariants", () => {
    const result = run(committedStaging);
    const individualOfficialPdf = result.products
      .filter((product) => !product.legacy_id?.startsWith("combo-"))
      .flatMap((product) => product.variants)
      .filter((variant) => variant.variant_kind === "decant" && variant.price_verification_status === "official_pdf");
    const bottles = result.products.flatMap((product) => product.variants).filter((variant) => variant.variant_kind === "bottle");
    const byIdentity = (identity: string) => result.products.find(
      (product) => (product.legacy_id ?? product.target_product.slug) === identity,
    );

    expect(individualOfficialPdf).toHaveLength(288);
    expect(bottles.filter((variant) => variant.price_verification_status === "provisional_market")).toHaveLength(20);
    expect(bottles.filter((variant) => variant.price_verification_status === "legacy")).toHaveLength(4);
    expect(byIdentity("invictus-elixir")?.target_product.publication_status).toBe("archived");
    expect(byIdentity("bir-intense")?.target_product.publication_status).toBe("draft");
    expect(byIdentity("le-male-le-parfum")?.legacy_id).toBeNull();
    expect(byIdentity("le-male-le-parfum")?.target_product.slug).toBe("le-male-le-parfum");
    for (const identity of ["lovely-cherry", "bright-peach", "ultra-male"]) {
      expect(byIdentity(identity)?.target_product).toMatchObject({
        production_status: "discontinued",
        availability_status: "available",
      });
    }
  });

  it("uses each reconciled member slug instead of assuming legacy_id equals slug", () => {
    const staging = structuredClone(committedStaging);
    productEntry(staging, "yara-pink").product.slug = "yara-pink-canonical";
    const result = run(staging);
    const vanilla = result.combo_targets?.find((combo) => combo.product.legacy_id === "combo-vainilla");

    expect(vanilla?.presentations[0]?.items[0]?.product).toEqual({
      legacy_id: "yara-pink",
      slug: "yara-pink-canonical",
    });
  });

  it("fails closed when a member product is missing", () => {
    const staging = structuredClone(committedStaging);
    staging.entries = staging.entries?.filter((entry) => entry.legacy_id !== "eclaire");
    const result = run(staging);

    expect(result.combo_targets?.some((combo) => combo.product.legacy_id === "combo-vainilla")).toBe(false);
    expect(result.conflicts).toContainEqual(expect.objectContaining({
      code: "MISSING_COMBO_MEMBER_PRODUCT",
      legacy_ids: ["combo-vainilla"],
    }));
  });

  it("fails closed when a member lacks a required same-size decant presentation", () => {
    const staging = structuredClone(committedStaging);
    const member = productEntry(staging, "khamrah-qahwa");
    member.variants = member.variants.filter((variant) => variant.size_ml !== 5);
    const result = run(staging);

    expect(result.combo_targets?.some((combo) => combo.product.legacy_id === "combo-cuarteto")).toBe(false);
    expect(result.conflicts).toContainEqual(expect.objectContaining({ code: "MISSING_COMBO_MEMBER_DECANT" }));
  });

  it("fails closed on duplicate members", () => {
    const staging = structuredClone(committedStaging);
    comboEntry(staging, "combo-tulum").combo!.composition_legacy_ids[2] = "odyssey-aqua";
    const result = run(staging);

    expect(result.combo_targets?.some((combo) => combo.product.legacy_id === "combo-tulum")).toBe(false);
    expect(result.conflicts).toContainEqual(expect.objectContaining({ code: "DUPLICATE_COMBO_MEMBER" }));
  });

  it("does not promote a combo with invalid or missing source authority", () => {
    const staging = structuredClone(committedStaging);
    comboEntry(staging, "combo-vainilla").combo!.composition_verification_status = "unknown";
    const result = run(staging);
    const vanilla = result.products.find((product) => product.legacy_id === "combo-vainilla");

    expect(result.combo_targets?.some((combo) => combo.product.legacy_id === "combo-vainilla")).toBe(false);
    expect(vanilla?.variants.every((variant) => variant.price_verification_status === "legacy")).toBe(true);
    expect(result.conflicts).toContainEqual(expect.objectContaining({ code: "INVALID_COMBO_AUTHORITY" }));
  });

  it("does not materialize a staged definition whose price differs from committed PDF evidence", () => {
    const staging = structuredClone(committedStaging);
    comboEntry(staging, "combo-cuarteto").variants[0]!.price_amount = 999;
    const result = run(staging);

    expect(result.combo_targets?.some((combo) => combo.product.legacy_id === "combo-cuarteto")).toBe(false);
    expect(result.conflicts).toContainEqual(expect.objectContaining({ code: "COMBO_PDF_DEFINITION_MISMATCH" }));
  });
});
