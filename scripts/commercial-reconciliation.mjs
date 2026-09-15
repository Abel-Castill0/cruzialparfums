/**
 * Cruzial Platform V2 — commercial reconciliation manifest (staging only)
 *
 * assets/data.js + legacy-catalog-staging.json + documented decisions/schema
 *   -> supabase/staging/commercial-reconciliation.json
 *
 * This layer enriches the existing legacy ETL output. It never parses a
 * second catalogue, writes to Supabase, publishes products, or migrates media.
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const paths = Object.freeze({
  legacySource: resolve(repositoryRoot, "assets/data.js"),
  legacyStaging: resolve(repositoryRoot, "supabase/staging/legacy-catalog-staging.json"),
  decisions: resolve(repositoryRoot, "docs/client-decisions.md"),
  catalogSchema: resolve(repositoryRoot, "supabase/migrations/20260907154348_catalog.sql"),
  integritySchema: resolve(repositoryRoot, "supabase/migrations/20260907154401_integrity_hardening.sql"),
  wholesaleSchema: resolve(repositoryRoot, "supabase/migrations/20260908070000_admin_parfums_wholesale.sql"),
  output: resolve(repositoryRoot, "supabase/staging/commercial-reconciliation.json"),
  pdfReconciliation: resolve(repositoryRoot, "supabase/staging/pdf-2026-commercial-reconciliation.json"),
  bottleMarketResearch: resolve(repositoryRoot, "supabase/staging/bottle-market-research.json"),
});

// Synchronous JSON read: VARIANT_PRICE_OVERRIDES below is a top-level frozen
// export derived from this persisted artifact, not a runtime fetch.
const pdfReconciliation = createRequire(import.meta.url)(paths.pdfReconciliation);

// Synchronous JSON read: same rationale as pdfReconciliation above. Populated
// by 4K-B2B.2A Batch A Peru market price research (Part G).
const bottleMarketResearch = createRequire(import.meta.url)(paths.bottleMarketResearch);

export const MIGRATION_STATUSES = Object.freeze([
  "MIGRATABLE_DRAFT",
  "MIGRATABLE_WITH_VERIFIED_FIELDS",
  "BLOCKED",
  "EXCLUDED",
]);
export const PUBLISH_ELIGIBILITIES = Object.freeze(["NOT_READY", "READY", "BLOCKED"]);
export const PROVENANCE_VALUES = Object.freeze([
  "OFFICIAL_PDF",
  "CLIENT_CONFIRMED",
  "DERIVED_VALIDATED",
  "MARKETING_COPY",
  "MARKET_RESEARCH",
  "UNKNOWN",
  "legacy",
]);

// price_verification_status is the compact, DB-persisted commercial-authority
// state for one variant row. field_provenance/price_provenance (above) is the
// richer audit trail (evidence + basis) behind that state. The two are
// deliberately separate concepts already: this list is the full authority
// vocabulary, ordered weakest-to-strongest. 'provisional_market' is an
// operator-approved, temporary researched price — it MUST NOT be conflated
// with 'official_pdf' or 'client_confirmed' anywhere in this file.
export const PRICE_VERIFICATION_STATUSES = Object.freeze([
  "unknown",
  "legacy",
  "provisional_market",
  "official_pdf",
  "client_confirmed",
]);
const PRICE_AUTHORITY_RANK = Object.freeze(
  Object.fromEntries(PRICE_VERIFICATION_STATUSES.map((status, index) => [status, index])),
);

const OFFICIAL_PDF_DECANT_EVIDENCE = evidence(
  ["OFFICIAL_PDF"],
  "Official 2026 client PDF (docs/client-source/CATALOGO DE DECANTS.pdf), independently reconciled and persisted in " +
  "supabase/staging/pdf-2026-commercial-reconciliation.json (4K-A3/4K-A3.1); applied as decant price authority in 4K-B2A. " +
  "\"Guíate del PDF, ese está actualizado.\" — client, 2026-09-13.",
);

const OFFICIAL_PDF_COMBO_EVIDENCE = evidence(
  ["OFFICIAL_PDF"],
  "Official 2026 client PDF combo definition persisted in supabase/staging/pdf-2026-commercial-reconciliation.json; " +
  "name, ordered composition, and 3/5/10 selling prices cross-checked before materialization.",
);
const COMBO_SIZES = Object.freeze([3, 5, 10]);

/**
 * The smallest deterministic mapping that satisfies the 4K-B2A Part A/B
 * contract: every one of the persisted artifact's 95 matched, current-PDF
 * decant rows (285 = 95 x 3ml/5ml/10ml) becomes one official_pdf variant
 * price override, at the PDF's own numeric value — whether or not that value
 * happens to already match the current legacy price. No per-product
 * conditionals are hand-written; the 279 unchanged rows and the 6 corrected
 * Sauvage EDT / Dylan Blue rows are produced by the exact same loop from the
 * exact same persisted source.
 */
function officialPdfDecantVariantPriceOverrides(reconciliation) {
  const sizes = [3, 5, 10];
  return reconciliation.product_reconciliation.map((product) => sizes.map((size, index) => ({
    legacy_id: product.legacy_id,
    variant_kind: "decant",
    size_ml: size,
    price_amount: product.decant_price_3_5_10.official_pdf[index],
    price_verification_status: "official_pdf",
    evidence: OFFICIAL_PDF_DECANT_EVIDENCE,
  }))).flat();
}

/**
 * 4K-B2B.2A Part H (extended by 4K-B2B.2B Batch B): bottle-only
 * provisional_market overrides, built from the persisted Peru
 * market-research artifact (supabase/staging/bottle-market-research.json),
 * which now holds both Batch A and Batch B entries. Only HIGH/MEDIUM-
 * confidence entries with a non-null selected_reference_pen are applied;
 * LOW-confidence/unresolved entries are deliberately skipped so their
 * variant stays at whatever authority it already had (Part E: "LOW remains
 * legacy/unresolved"). This never targets a decant row (variant_kind is
 * always "bottle" here) and never touches the official_pdf 3/5/10 ml
 * overrides above. Keyed by legacy_id + size_ml, so a legacy_id with two
 * bottle-price variants (e.g. erba-pura 50 ml / 100 ml) gets one override
 * per size, never merged.
 */
function bottleMarketPriceOverrides(research) {
  return research.entries
    .filter((entry) => (entry.confidence === "HIGH" || entry.confidence === "MEDIUM") && entry.selected_reference_pen !== null)
    .map((entry) => ({
      legacy_id: entry.legacy_id,
      variant_kind: "bottle",
      size_ml: entry.size_ml,
      price_amount: entry.selected_reference_pen,
      price_verification_status: "provisional_market",
      evidence: evidence(
        ["MARKET_RESEARCH"],
        `${entry.gate ?? "4K-B2B.2A"} Batch ${entry.batch ?? "A"} Peru market research (supabase/staging/bottle-market-research.json, legacy_id=${entry.legacy_id}, size_ml=${entry.size_ml}): ` +
        `${entry.confidence} confidence, ${entry.selection_method}, S/ ${entry.selected_reference_pen} from ` +
        `${entry.observations.length} credible Peru observation(s) (S/ ${entry.min_credible_pen}–S/ ${entry.max_credible_pen}). ` +
        "Operator-authorized TEMPORARY market reference only — not official_pdf, not client_confirmed.",
      ),
    }));
}

// Populated from the persisted 4K-A3/4K-A3.1 PDF reconciliation artifact
// (Part A/B). Every current-PDF-matched decant row — unchanged and corrected
// alike — gets official_pdf authority; bottle variants and the V2-only
// invictus-elixir decant rows are untouched because they have no entry in
// reconciliation.product_reconciliation (Part H/D). Concatenated with the
// 4K-B2B.2A bottle-only provisional_market overrides derived from the Batch A
// market-research artifact (Part H) — the two sets can never collide because
// one is exclusively variant_kind "decant" and the other exclusively "bottle".
export const VARIANT_PRICE_OVERRIDES = Object.freeze([
  ...officialPdfDecantVariantPriceOverrides(pdfReconciliation),
  ...bottleMarketPriceOverrides(bottleMarketResearch),
]);

// A lifecycle override lets a newer, named source (e.g. the official PDF)
// supersede a product's derived publication_status — the "this legacy product
// no longer belongs to the current official catalog" (archived) case, or a
// superseded hidden/visibility decision. It changes the actual target value,
// unlike FIELD_OVERRIDES below which only annotates provenance for values
// assumed already correct in assets/data.js.
export const PRODUCT_LIFECYCLE_OVERRIDES = Object.freeze([
  {
    // Part D: absent from the current authoritative client PDF. Archived from
    // the current active catalog; the row/history stay intact (no delete),
    // and its existing legacy decant prices are deliberately left out of
    // VARIANT_PRICE_OVERRIDES above so they are never reinterpreted as
    // official_pdf.
    legacy_id: "invictus-elixir",
    publication_status: "archived",
    evidence: evidence(
      ["UNKNOWN"],
      "V2-only; absent from the current authoritative client PDF (supabase/staging/pdf-2026-commercial-reconciliation.json " +
      "-> v2_only_products). The PDF is silent on this product, which is not itself evidence of discontinuation, but it is no " +
      "longer part of the client's current authoritative catalog, so it is archived from current active authority while its " +
      "record and price history remain readable. 4K-B2A Part D.",
    ),
  },
  {
    // Part E: the newer official PDF (active, priced, non-discontinued)
    // supersedes the 2026-09-06 CLIENT_CONFIRMED no-stock hidden decision
    // recorded inline at assets/data.js:472 and in docs/client-decisions.md.
    // That original decision is left in place as history; this override only
    // changes what current commercial authority computes. draft (not
    // published) because unhiding is not the same claim as publish-ready.
    legacy_id: "bir-intense",
    publication_status: "draft",
    evidence: evidence(
      ["OFFICIAL_PDF"],
      "Confirmed active/current in the official 2026 PDF (page 34; decant prices 26/34/56 exact match). This newer " +
      "authoritative source supersedes the 2026-09-06 CLIENT_CONFIRMED hidden decision, which was based on then-current " +
      "no-stock information now superseded by client instruction 2026-09-13 (\"Guíate del PDF, ese está actualizado.\"). " +
      "4K-B2A Part E.",
    ),
  },
]);

/**
 * Official-PDF-only product with no legacy_id / no row in assets/data.js
 * (Part C). Only the PDF-evidenced fields are set; everything the persisted
 * reconciliation artifact does not state (brand, gender, concentration,
 * notes, bestseller, bottle price, media) is left null/UNKNOWN by
 * supplementalToStagingEntry's own defaults rather than guessed.
 */
export const SUPPLEMENTAL_PRODUCTS = Object.freeze([
  {
    slug: "le-male-le-parfum",
    name: "Le Male Le Parfum",
    variants: [
      { label: "3 ml", variant_kind: "decant", size_ml: 3, price_amount: 24, currency: "PEN", sort_order: 0, price_verification_status: "official_pdf" },
      { label: "5 ml", variant_kind: "decant", size_ml: 5, price_amount: 32, currency: "PEN", sort_order: 1, price_verification_status: "official_pdf" },
      { label: "10 ml", variant_kind: "decant", size_ml: 10, price_amount: 51, currency: "PEN", sort_order: 2, price_verification_status: "official_pdf" },
    ],
  },
]);

/**
 * The stable reconciliation identity for an entry: its legacy_id when one
 * exists, otherwise its slug (the only identity a supplemental, official-
 * source-only product can have). Used uniformly so override lookups never
 * need to branch on where a product came from.
 */
function productIdentity(entry) {
  return entry.legacy_id ?? entry.product?.slug ?? null;
}

function variantIdentityKey(identity, variant) {
  return `${identity}:${variant.variant_kind}:${variant.size_ml ?? "null"}`;
}

/**
 * Builds a Map from an overrides array, failing loudly on any duplicate key
 * instead of letting a later entry silently win. This is the generic
 * duplicate/conflict guard required for every override collection below.
 */
function buildOverrideIndex(overrides, keyOf, validate, label) {
  const index = new Map();
  for (const override of overrides) {
    const key = keyOf(override);
    if (index.has(key)) {
      throw new Error(`Conflicting ${label} override for ${key}: duplicate authority entries are not allowed.`);
    }
    validate(override, key);
    index.set(key, override);
  }
  return index;
}

function validateVariantPriceOverride(override, key) {
  if (!isPositiveFiniteNumber(override.price_amount)) {
    throw new Error(`Invalid ${key} price override: price_amount must be a positive finite number.`);
  }
  if (override.price_verification_status === "legacy" || override.price_verification_status === "unknown") {
    throw new Error(`Invalid ${key} price override: an override must assert real authority, not '${override.price_verification_status}'.`);
  }
  if (!PRICE_VERIFICATION_STATUSES.includes(override.price_verification_status)) {
    throw new Error(`Invalid ${key} price override: unknown price_verification_status '${override.price_verification_status}'.`);
  }
  if (!override.evidence?.basis) {
    throw new Error(`Invalid ${key} price override: evidence with a basis is required for every override.`);
  }
}

function validateLifecycleOverride(override, key) {
  if (!["draft", "published", "hidden", "archived"].includes(override.publication_status)) {
    throw new Error(`Invalid ${key} lifecycle override: unknown publication_status '${override.publication_status}'.`);
  }
  if (!override.evidence?.basis) {
    throw new Error(`Invalid ${key} lifecycle override: evidence with a basis is required for every override.`);
  }
}

function isPositiveFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Maps one SUPPLEMENTAL_PRODUCTS record (Part E: a product the current
 * official source carries but the legacy catalogue never did) into the same
 * LegacyStagingEntry shape reconcileProduct already understands, so no
 * separate code path is needed downstream. legacy_id is null by design —
 * identity is the slug. Anything the source doesn't state stays null with
 * UNKNOWN field_provenance; nothing is invented (Part E requirement).
 */
function supplementalToStagingEntry(supplemental) {
  if (supplemental.legacy_id) {
    throw new Error(`Supplemental product '${supplemental.slug}' must not declare a legacy_id: it is official-source-only by definition.`);
  }
  if (!supplemental.slug || !supplemental.name) {
    throw new Error("Supplemental product entries require both slug and name.");
  }
  return {
    legacy_id: null,
    source: "official_pdf_supplement",
    fieldEvidence: supplemental.fieldEvidence ?? {},
    product: {
      legacy_id: null,
      slug: supplemental.slug,
      name: supplemental.name,
      brand: supplemental.brand ?? null,
      description: supplemental.description ?? null,
      gender: supplemental.gender ?? null,
      concentration: supplemental.concentration ?? null,
      // Conservative structural defaults only — the same defaults the schema
      // itself uses — never a fabricated commercial claim.
      sales_mode: "always_available",
      production_status: "active",
      availability_status: "available",
      publication_status: "draft",
      is_featured: false,
      featured_rank: null,
      featured_from: null,
      featured_until: null,
      verification_status: "unknown",
      specs: { legacy_hidden: false, legacy_bestseller_unverified: false },
    },
    variants: supplemental.variants ?? [],
    categories: supplemental.categories ?? [],
    fingerprint: sha256(JSON.stringify({
      slug: supplemental.slug,
      name: supplemental.name,
      variants: supplemental.variants ?? [],
    })),
  };
}

/**
 * Only 'client_confirmed' and 'official_pdf' are strong enough to clear a
 * variant for publication. 'legacy' and 'provisional_market' both block it —
 * for different, explicit reasons — so neither can silently pass as verified
 * client truth (Part C).
 */
function variantPriceBlockers(priceVerificationStatus) {
  if (priceVerificationStatus === "legacy") return ["LEGACY_PRICE_NOT_APPROVED_FOR_PUBLICATION"];
  if (priceVerificationStatus === "provisional_market") return ["PROVISIONAL_MARKET_PRICE_REQUIRES_COMMERCIAL_APPROVAL"];
  return [];
}

const COMMERCIAL_TYPE_MAP = Object.freeze({
  arab: "arabic",
  arabic: "arabic",
  designer: "designer",
  niche: "niche",
});
const STABLE_COMMERCIAL_TYPES = new Set(["arabic", "designer", "niche"]);
const DOCUMENTED_BOTTLE_PRICE_COUNT = 24;
const COMMERCIAL_CATEGORY_NAMES = Object.freeze({
  arabic: "Árabe",
  designer: "Diseñador",
  niche: "Nicho",
});
const PRODUCT_FIELDS = Object.freeze([
  "legacy_id",
  "slug",
  "name",
  "brand",
  "short_description",
  "description",
  "gender",
  "concentration",
  "sales_mode",
  "production_status",
  "availability_status",
  "publication_status",
  "is_featured",
  "featured_rank",
  "featured_from",
  "featured_until",
  "verification_status",
  "specs",
]);

const FIELD_OVERRIDES = Object.freeze({
  "1-million-lucky": {
    name: evidence(["CLIENT_CONFIRMED", "DERIVED_VALIDATED"], "docs/client-decisions.md: numeral-to-word correction confirmed against the bottle; Lucky identity retained"),
  },
  "amber-o-gold-e": {
    name: evidence(["DERIVED_VALIDATED"], "docs/client-decisions.md: corrected to Amber Oud Gold Edition from bottle label and filename"),
  },
  "bir-intense": {
    publication_status: evidence(["CLIENT_CONFIRMED"], "docs/client-decisions.md: retain the record but hide it from every public commercial surface"),
    "specs.legacy_hidden": evidence(["CLIENT_CONFIRMED"], "docs/client-decisions.md: explicit retained-but-hidden legacy marker"),
  },
  "cdn-preciux-i": {
    name: evidence(["DERIVED_VALIDATED"], "docs/client-decisions.md: Precieux spelling validated from the Armaf bottle"),
  },
  "purple-melancholia": {
    brand: evidence(["CLIENT_CONFIRMED", "DERIVED_VALIDATED"], "docs/client-decisions.md: Valentino identity confirmed and validated against the bottle"),
  },
  "red-intensely": {
    brand: evidence(["CLIENT_CONFIRMED", "DERIVED_VALIDATED"], "docs/client-decisions.md: Dumont Paris correction confirmed against the bottle"),
    name: evidence(["CLIENT_CONFIRMED", "DERIVED_VALIDATED"], "docs/client-decisions.md: Nitro Red Intensely correction confirmed against the bottle"),
  },
  "reserve-privee": {
    brand: evidence(["CLIENT_CONFIRMED", "DERIVED_VALIDATED"], "docs/client-decisions.md: Givenchy correction confirmed against the bottle"),
    name: evidence(["CLIENT_CONFIRMED", "DERIVED_VALIDATED"], "docs/client-decisions.md: Gentleman Réserve Privée correction confirmed against the bottle"),
  },
  "sceptre-malachite": {
    brand: evidence(["DERIVED_VALIDATED"], "docs/client-decisions.md: Maison Alhambra already matched the deployed bottle"),
    name: evidence(["DERIVED_VALIDATED"], "docs/client-decisions.md: Sceptre Malachite already matched the deployed bottle"),
  },
  "supremacy-noi": {
    name: evidence(["CLIENT_CONFIRMED"], "docs/client-decisions.md: full Supremacy Not Only Intense name confirmed by the client"),
  },
});

const CATEGORY_PROVENANCE_OVERRIDES = Object.freeze({
  "purple-melancholia:commercial_type": evidence(
    ["CLIENT_CONFIRMED"],
    "docs/client-decisions.md: commercial type corrected from niche to designer",
  ),
});

function evidence(provenance, basis) {
  return { provenance, basis };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableCompare(left, right) {
  return String(left).localeCompare(String(right), "en");
}

export function normalizeCategorySlug(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function targetCategorySlug(category) {
  if (category.kind === "commercial_type") {
    return COMMERCIAL_TYPE_MAP[category.slug] ?? null;
  }
  return normalizeCategorySlug(category.slug);
}

function targetCategoryName(category) {
  const targetSlug = targetCategorySlug(category);
  if (category.kind === "commercial_type") return COMMERCIAL_CATEGORY_NAMES[targetSlug] ?? null;
  const sourceName = String(category.slug).trim();
  return sourceName ? `${sourceName[0].toLocaleUpperCase("es-PE")}${sourceName.slice(1)}` : null;
}

function defaultFieldProvenance(entry) {
  const isSupplemental = entry?.source === "official_pdf_supplement";
  return Object.fromEntries(PRODUCT_FIELDS.map((field) => [
    field,
    field === "short_description"
      ? evidence(["UNKNOWN"], "The legacy staging contract has no short description; the optional target remains null")
      : isSupplemental
        ? evidence(["UNKNOWN"], "Official-source supplemental product; field is not confirmed by any source and is not fabricated")
        : evidence(["legacy"], "Preserved from the legacy staging artifact without approval promotion"),
  ]));
}

function checkProductConstraints(entry, targetProduct, targetVariants, { hasLifecycleOverride = false } = {}) {
  const conflicts = [];
  const add = (code, detail) => conflicts.push({ code, detail });
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

  // A supplemental, official-source-only product has no legacy_id by design
  // (Part E); its stable identity is its slug instead. This is a source-type
  // branch, not a per-product one.
  if (!entry.legacy_id && entry.source !== "official_pdf_supplement") add("MISSING_LEGACY_ID", "legacy_id is required for stable reconciliation identity");
  if (!targetProduct.name) add("MISSING_PRODUCT_NAME", "products.name is required");
  if (!targetProduct.slug || !slugPattern.test(targetProduct.slug) || targetProduct.slug.length > 120) {
    add("INVALID_TARGET_SLUG", `products.slug is incompatible with the current contract: ${String(targetProduct.slug)}`);
  }
  if (targetProduct.name && targetProduct.name.length > 200) add("PRODUCT_NAME_TOO_LONG", "products.name exceeds 200 characters");
  if (targetProduct.description && targetProduct.description.length > 4000) add("PRODUCT_DESCRIPTION_TOO_LONG", "products.description exceeds 4000 characters");
  if (!["campaign", "always_available", "catalog_only"].includes(targetProduct.sales_mode)) add("INVALID_SALES_MODE", targetProduct.sales_mode);
  if (!["active", "discontinued"].includes(targetProduct.production_status)) add("INVALID_PRODUCTION_STATUS", targetProduct.production_status);
  if (!["available", "out_of_stock"].includes(targetProduct.availability_status)) add("INVALID_AVAILABILITY_STATUS", targetProduct.availability_status);
  if (!["draft", "published", "hidden", "archived"].includes(targetProduct.publication_status)) add("INVALID_PRODUCT_PUBLICATION_STATUS", targetProduct.publication_status);
  if (!["legacy", "client_confirmed", "derived_validated", "official_pdf", "unknown"].includes(targetProduct.verification_status)) add("INVALID_VERIFICATION_STATUS", targetProduct.verification_status);
  if (targetProduct.featured_rank !== null && (!targetProduct.is_featured || !Number.isInteger(targetProduct.featured_rank) || targetProduct.featured_rank < 0)) add("INVALID_FEATURED_RANK", String(targetProduct.featured_rank));
  if (targetProduct.featured_from && targetProduct.featured_until && Date.parse(targetProduct.featured_until) <= Date.parse(targetProduct.featured_from)) add("INVALID_FEATURED_WINDOW", "featured_until must be later than featured_from");
  // A documented lifecycle override is a newer, named source superseding the
  // derived hidden/draft state on purpose (Part D/F); it is exempt from the
  // legacy_hidden agreement check below, which otherwise guards against an
  // *undocumented* mismatch.
  if (!hasLifecycleOverride) {
    if (targetProduct.publication_status === "hidden" && !targetProduct.specs.legacy_hidden) add("HIDDEN_STATUS_CONTRADICTION", "target is hidden without legacy_hidden evidence");
    if (targetProduct.specs.legacy_hidden && targetProduct.publication_status !== "hidden") add("HIDDEN_STATUS_CONTRADICTION", "legacy_hidden must map to the independent hidden publication state");
  }
  if (targetVariants.length === 0) add("NO_USABLE_VARIANT", "product has no variant compatible with product_variants");

  const labels = new Set();
  for (const variant of targetVariants) {
    if (labels.has(variant.label)) add("DUPLICATE_VARIANT_LABEL", variant.label);
    labels.add(variant.label);
    if (!["decant", "bottle"].includes(variant.variant_kind)) add("INVALID_VARIANT_KIND", variant.variant_kind);
    if (!variant.label || variant.label.length > 60) add("INVALID_VARIANT_LABEL", String(variant.label));
    if (typeof variant.price_amount !== "number" || !Number.isFinite(variant.price_amount) || variant.price_amount < 0) add("INVALID_VARIANT_PRICE", `${variant.label}: ${String(variant.price_amount)}`);
    if (variant.size_ml !== null && (typeof variant.size_ml !== "number" || !Number.isFinite(variant.size_ml) || variant.size_ml <= 0)) add("INVALID_VARIANT_SIZE", `${variant.label}: ${String(variant.size_ml)}`);
    if (variant.currency !== "PEN") add("INVALID_VARIANT_CURRENCY", `${variant.label}: ${variant.currency}`);
    if (!["draft", "published", "archived"].includes(variant.publication_status)) add("INVALID_VARIANT_PUBLICATION_STATUS", `${variant.label}: ${variant.publication_status}`);
    if (!PRICE_VERIFICATION_STATUSES.includes(variant.price_verification_status)) add("INVALID_PRICE_VERIFICATION_STATUS", `${variant.label}: ${variant.price_verification_status}`);
  }
  return conflicts;
}

function reconcileProduct(entry, overrideIndexes = {}) {
  const { variantPriceOverrideIndex = new Map(), productLifecycleOverrideIndex = new Map() } = overrideIndexes;
  const identity = productIdentity(entry);
  const lifecycleOverride = productLifecycleOverrideIndex.get(identity);

  const targetProduct = {
    legacy_id: entry.legacy_id,
    slug: entry.product.slug,
    name: entry.product.name,
    brand: entry.product.brand ?? null,
    short_description: null,
    description: entry.product.description ?? null,
    gender: entry.product.gender ?? null,
    concentration: entry.product.concentration ?? null,
    sales_mode: entry.product.sales_mode,
    production_status: entry.product.production_status,
    availability_status: entry.product.availability_status,
    publication_status: lifecycleOverride?.publication_status ?? (entry.product.specs?.legacy_hidden ? "hidden" : "draft"),
    is_featured: Boolean(entry.product.is_featured),
    featured_rank: entry.product.featured_rank ?? null,
    featured_from: entry.product.featured_from ?? null,
    featured_until: entry.product.featured_until ?? null,
    verification_status: entry.source === "official_pdf_supplement" ? "unknown" : "legacy",
    specs: entry.product.specs ?? {},
  };
  const fieldProvenance = defaultFieldProvenance(entry);
  fieldProvenance.publication_status = lifecycleOverride
    ? lifecycleOverride.evidence
    : evidence(
      ["DERIVED_VALIDATED"],
      "Conservative migration policy maps unapproved products to draft; explicit legacy_hidden maps to the schema's hidden state",
    );
  fieldProvenance.verification_status = evidence(
    ["DERIVED_VALIDATED"],
    "Conservative reduction to legacy because one database column cannot express mixed field-level evidence",
  );

  const overrides = { ...(FIELD_OVERRIDES[identity] ?? {}), ...(entry.fieldEvidence ?? {}) };
  for (const [field, provenance] of Object.entries(overrides)) fieldProvenance[field] = provenance;

  const variants = [...(entry.variants ?? [])]
    .map((variant) => {
      const priceOverride = variantPriceOverrideIndex.get(variantIdentityKey(identity, variant));
      const priceAmount = priceOverride?.price_amount ?? variant.price_amount;
      const priceVerificationStatus = priceOverride?.price_verification_status ?? variant.price_verification_status;
      const priceProvenance = priceOverride
        ? priceOverride.evidence
        : evidence(
          [variant.price_verification_status],
          entry.source === "official_pdf_supplement"
            ? OFFICIAL_PDF_DECANT_EVIDENCE.basis
            : "Preserved exactly from assets/data.js through the existing legacy ETL",
        );
      return {
        variant_kind: variant.variant_kind,
        size_ml: variant.size_ml ?? null,
        label: variant.label,
        price_amount: priceAmount,
        currency: variant.currency,
        publication_status: "draft",
        price_verification_status: priceVerificationStatus,
        sort_order: variant.sort_order,
        price_provenance: priceProvenance,
        publish_eligibility: priceVerificationStatus === "client_confirmed" || priceVerificationStatus === "official_pdf" ? "NOT_READY" : "NOT_READY",
        blockers: variantPriceBlockers(priceVerificationStatus),
      };
    })
    .sort((left, right) => left.sort_order - right.sort_order || stableCompare(left.label, right.label));

  const categories = [...(entry.categories ?? [])]
    .map((category) => {
      const targetSlug = targetCategorySlug(category);
      const override = CATEGORY_PROVENANCE_OVERRIDES[`${identity}:${category.kind}`];
      const transformation = targetSlug && targetSlug !== category.slug
        ? category.kind === "commercial_type"
          ? "EXPLICIT_STABLE_IDENTITY_MAP"
          : "ASCII_SLUG_NORMALIZATION"
        : "NONE";
      return {
        kind: category.kind,
        source_slug: category.slug,
        target_slug: targetSlug,
        source_provenance: override ?? evidence(["legacy"], "Preserved from legacy staging; normalization does not upgrade evidence"),
        transformation,
        migration_eligibility: targetSlug ? "MIGRATABLE" : "BLOCKED",
        publication_intent: "draft",
      };
    })
    .sort((left, right) => stableCompare(`${left.kind}:${left.target_slug}`, `${right.kind}:${right.target_slug}`));

  const localConflicts = checkProductConstraints(entry, targetProduct, variants, { hasLifecycleOverride: Boolean(lifecycleOverride) });
  for (const category of categories) {
    if (!["commercial_type", "olfactory_family"].includes(category.kind)) localConflicts.push({ code: "INVALID_CATEGORY_KIND", detail: category.kind });
    if (!category.target_slug) localConflicts.push({ code: "INVALID_COMMERCIAL_TYPE", detail: `${category.kind}:${category.source_slug}` });
    if (category.kind === "commercial_type" && category.target_slug && !STABLE_COMMERCIAL_TYPES.has(category.target_slug)) localConflicts.push({ code: "INVALID_COMMERCIAL_TYPE", detail: category.target_slug });
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(category.target_slug ?? "")) localConflicts.push({ code: "INVALID_CATEGORY_SLUG", detail: String(category.target_slug) });
  }

  const hasVerifiedFields = Object.values(fieldProvenance).some((item) => item.provenance.some((value) => value !== "legacy" && value !== "UNKNOWN" && value !== "DERIVED_VALIDATED"))
    || Object.values(overrides).length > 0
    || categories.some((category) => category.source_provenance.provenance.some((value) => value !== "legacy"));
  const migrationStatus = localConflicts.length > 0
    ? "BLOCKED"
    : hasVerifiedFields
      ? "MIGRATABLE_WITH_VERIFIED_FIELDS"
      : "MIGRATABLE_DRAFT";
  const warnings = hasVerifiedFields ? ["MIXED_PROVENANCE_REDUCED_TO_LEGACY_VERIFICATION_STATUS"] : [];
  if (targetProduct.production_status === "discontinued" && targetProduct.availability_status === "available") warnings.push("DISCONTINUED_AVAILABLE_PRESERVED_INDEPENDENTLY");
  if (targetProduct.specs.legacy_bestseller_unverified) warnings.push("LEGACY_BESTSELLER_RETAINED_ONLY_AS_UNVERIFIED_METADATA");
  if (targetProduct.publication_status === "hidden") warnings.push("HIDDEN_PUBLICATION_DOES_NOT_IMPLY_OUT_OF_STOCK");
  if (lifecycleOverride) warnings.push("CURRENT_AUTHORITY_LIFECYCLE_OVERRIDE_APPLIED");
  if (variants.some((variant) => variantPriceOverrideIndex.has(variantIdentityKey(identity, variant)))) warnings.push("VARIANT_PRICE_OVERRIDE_APPLIED");
  if (variants.some((variant) => variant.price_verification_status === "provisional_market")) warnings.push("PROVISIONAL_MARKET_PRICE_NOT_CLIENT_CONFIRMED");

  const product = {
    legacy_id: entry.legacy_id,
    migration_status: migrationStatus,
    publish_eligibility: migrationStatus === "BLOCKED" || targetProduct.publication_status === "hidden" ? "BLOCKED" : "NOT_READY",
    target_product: targetProduct,
    field_provenance: fieldProvenance,
    variants,
    categories,
    inventory_intent: {
      applies_to_each_variant: true,
      inventory_mode: "status_only",
      quantity_on_hand: null,
      availability_status: targetProduct.availability_status,
      field_provenance: {
        inventory_mode: evidence(["DERIVED_VALIDATED"], "Safest current-schema mode while the operating model is unknown"),
        quantity_on_hand: evidence(["UNKNOWN"], "No reliable quantity evidence; no quantity is invented"),
        availability_status: evidence(["legacy"], "Preserved independently from production and publication status"),
      },
    },
    media_dependency: {
      manifest: "supabase/staging/client-media-reconciliation.json",
      lookup_key: identity,
      write_status: "DEFERRED_TO_4F2B",
    },
    warnings: warnings.sort(stableCompare),
    blockers: [
      ...(variants.some((variant) => variant.price_verification_status === "legacy") ? ["LEGACY_PRICES_REQUIRE_COMMERCIAL_APPROVAL"] : []),
      ...(variants.some((variant) => variant.price_verification_status === "provisional_market") ? ["PROVISIONAL_MARKET_PRICES_REQUIRE_COMMERCIAL_APPROVAL"] : []),
      ...(targetProduct.publication_status === "hidden" ? ["CLIENT_CONFIRMED_HIDDEN"] : []),
      ...localConflicts.map((conflict) => conflict.code),
    ].sort(stableCompare),
    conflicts: localConflicts.sort((left, right) => stableCompare(`${left.code}:${left.detail}`, `${right.code}:${right.detail}`)),
  };
  product.source_fingerprint = sha256(JSON.stringify({
    staging_fingerprint: entry.fingerprint,
    target_product: product.target_product,
    field_provenance: product.field_provenance,
    variants: product.variants,
    categories: product.categories,
    inventory_intent: product.inventory_intent,
  }));
  return product;
}

function globalConflicts(staging, products, documentedBottlePriceCount) {
  const conflicts = [];
  const duplicateValues = (values) => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))].sort(stableCompare);
  // null is not a real identity collision — a supplemental, official-source
  // product legitimately has no legacy_id (Part E), and Postgres itself
  // allows multiple nulls under the unit+legacy_id unique constraint.
  for (const legacyId of duplicateValues(products.map((product) => product.legacy_id).filter((legacyId) => legacyId !== null))) conflicts.push({ code: "DUPLICATE_LEGACY_ID", legacy_ids: [legacyId], detail: legacyId });
  for (const slug of duplicateValues(products.map((product) => product.target_product.slug))) conflicts.push({ code: "DUPLICATE_TARGET_SLUG", legacy_ids: products.filter((product) => product.target_product.slug === slug).map((product) => product.legacy_id).sort(stableCompare), detail: slug });

  const categoryIdentities = new Map();
  for (const product of products) {
    for (const category of product.categories) {
      if (!category.target_slug) continue;
      const identity = `${category.kind}:${category.source_slug}`;
      const identities = categoryIdentities.get(category.target_slug) ?? new Map();
      const legacyIds = identities.get(identity) ?? new Set();
      legacyIds.add(product.legacy_id);
      identities.set(identity, legacyIds);
      categoryIdentities.set(category.target_slug, identities);
    }
  }
  for (const [slug, identities] of [...categoryIdentities.entries()].sort(([left], [right]) => stableCompare(left, right))) {
    if (identities.size > 1) conflicts.push({
      code: "CATEGORY_NORMALIZATION_COLLISION",
      legacy_ids: [...new Set([...identities.values()].flatMap((ids) => [...ids]))].sort(stableCompare),
      detail: `${slug}: ${[...identities.keys()].sort(stableCompare).join(", ")}`,
    });
  }
  for (const product of products) {
    for (const conflict of product.conflicts) conflicts.push({ ...conflict, legacy_ids: [product.legacy_id] });
  }
  if (documentedBottlePriceCount !== undefined) {
    const actualBottlePriceCount = products.flatMap((product) => product.variants).filter((variant) => variant.variant_kind === "bottle").length;
    if (actualBottlePriceCount !== documentedBottlePriceCount) conflicts.push({
      code: "DOCUMENTED_BOTTLE_PRICE_COUNT_MISMATCH",
      legacy_ids: [],
      detail: `docs/client-decisions.md records ${documentedBottlePriceCount}; current legacy staging contains ${actualBottlePriceCount}`,
    });
  }
  return conflicts.sort((left, right) => stableCompare(`${left.code}:${left.detail}`, `${right.code}:${right.detail}`));
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * Validate every structured combo before either its selling-price authority
 * or composition target can be emitted. Invalid combos remain ordinary draft
 * product rows but receive a reconciliation conflict and no combo target;
 * this makes the pipeline fail closed without discarding their source data.
 */
function reconcileComboMaterialization(entries, products, comboEvidence) {
  const comboEntries = entries.filter((entry) => entry.combo !== undefined);
  const targets = [];
  const priceOverrides = [];
  const conflicts = [];
  const identityCounts = new Map();
  for (const entry of comboEntries) {
    const identity = productIdentity(entry);
    identityCounts.set(identity, (identityCounts.get(identity) ?? 0) + 1);
  }

  const productsByLegacyId = new Map();
  for (const product of products) {
    if (product.legacy_id === null) continue;
    const matches = productsByLegacyId.get(product.legacy_id) ?? [];
    matches.push(product);
    productsByLegacyId.set(product.legacy_id, matches);
  }

  for (const entry of comboEntries) {
    const identity = productIdentity(entry);
    const local = [];
    const add = (code, detail) => local.push({ code, legacy_ids: [identity], detail });
    const combo = entry.combo ?? {};
    const members = Array.isArray(combo.composition_legacy_ids) ? combo.composition_legacy_ids : [];
    const productMatches = productsByLegacyId.get(entry.legacy_id) ?? [];
    const comboProduct = productMatches[0];

    if ((identityCounts.get(identity) ?? 0) !== 1) add("DUPLICATE_COMBO_IDENTITY", `Combo identity '${identity}' is not unique.`);
    if (combo.composition_verification_status !== "official_pdf" || combo.source_state !== "OFFICIAL_PDF_CONFIRMED") {
      add("INVALID_COMBO_AUTHORITY", `Combo '${identity}' lacks explicit official_pdf composition authority.`);
    }
    if (members.length === 0) add("MISSING_COMBO_MEMBERS", `Combo '${identity}' has no confirmed composition members.`);
    if (new Set(members).size !== members.length) add("DUPLICATE_COMBO_MEMBER", `Combo '${identity}' repeats a composition member.`);
    if (members.includes(identity)) add("COMBO_SELF_REFERENCE", `Combo '${identity}' references itself.`);
    if (productMatches.length !== 1) add("INVALID_COMBO_PRODUCT_IDENTITY", `Combo '${identity}' does not resolve to exactly one reconciled product.`);

    const pdfMatches = comboEvidence.filter((candidate) => candidate.name === entry.product?.name);
    if (pdfMatches.length !== 1) {
      add("COMBO_PDF_IDENTITY_MISMATCH", `Combo '${identity}' does not match exactly one committed PDF definition by source name.`);
    }
    const pdfCombo = pdfMatches[0];
    const stagedPrices = COMBO_SIZES.map((size) => entry.variants?.find(
      (variant) => variant.variant_kind === "decant" && variant.size_ml === size,
    )?.price_amount);
    const exactComboVariants = (entry.variants ?? []).filter((variant) => variant.variant_kind === "decant");
    if (exactComboVariants.length !== COMBO_SIZES.length || stagedPrices.some((price) => !isPositiveFiniteNumber(price))) {
      add("INVALID_COMBO_PRESENTATIONS", `Combo '${identity}' must have exactly one positive 3/5/10 decant selling variant.`);
    }
    if (pdfCombo && (!arraysEqual(members, pdfCombo.members_legacy_ids ?? []) || !arraysEqual(stagedPrices, pdfCombo.decant_price_3_5_10 ?? []))) {
      add("COMBO_PDF_DEFINITION_MISMATCH", `Combo '${identity}' staged members/prices differ from the committed PDF evidence.`);
    }

    const resolvedMembers = [];
    for (const memberIdentity of members) {
      const matches = productsByLegacyId.get(memberIdentity) ?? [];
      if (matches.length !== 1) {
        add("MISSING_COMBO_MEMBER_PRODUCT", `Combo '${identity}' member '${memberIdentity}' does not resolve to exactly one reconciled product.`);
        continue;
      }
      const member = matches[0];
      for (const size of COMBO_SIZES) {
        const variants = member.variants.filter((variant) => variant.variant_kind === "decant" && variant.size_ml === size);
        if (variants.length !== 1) add("MISSING_COMBO_MEMBER_DECANT", `Combo '${identity}' member '${memberIdentity}' lacks one unique ${size}ml decant variant.`);
      }
      resolvedMembers.push(member);
    }

    if (local.length > 0) {
      conflicts.push(...local);
      continue;
    }

    for (const [index, size] of COMBO_SIZES.entries()) {
      priceOverrides.push({
        legacy_id: entry.legacy_id,
        variant_kind: "decant",
        size_ml: size,
        price_amount: pdfCombo.decant_price_3_5_10[index],
        price_verification_status: "official_pdf",
        evidence: OFFICIAL_PDF_COMBO_EVIDENCE,
      });
    }
    targets.push({
      product: { legacy_id: comboProduct.legacy_id, slug: comboProduct.target_product.slug },
      composition_verification_status: "official_pdf",
      presentations: COMBO_SIZES.map((size) => ({
        variant: { variant_kind: "decant", size_ml: size },
        items: resolvedMembers.map((member, sortOrder) => ({
          product: { legacy_id: member.legacy_id, slug: member.target_product.slug },
          variant: { variant_kind: "decant", size_ml: size },
          quantity: 1,
          sort_order: sortOrder,
        })),
      })),
    });
  }

  return {
    targets: targets.sort((left, right) => stableCompare(left.product.slug, right.product.slug)),
    priceOverrides,
    conflicts: conflicts.sort((left, right) => stableCompare(`${left.code}:${left.detail}`, `${right.code}:${right.detail}`)),
  };
}

export function reconcileCommercialCatalog({
  staging,
  sourceFingerprints = {},
  documentedBottlePriceCount,
  variantPriceOverrides = VARIANT_PRICE_OVERRIDES,
  productLifecycleOverrides = PRODUCT_LIFECYCLE_OVERRIDES,
  supplementalProducts = SUPPLEMENTAL_PRODUCTS,
  comboEvidence = pdfReconciliation.combos ?? [],
}) {
  const baseVariantPriceOverrideIndex = buildOverrideIndex(
    variantPriceOverrides,
    (override) => variantIdentityKey(override.legacy_id ?? override.slug, override),
    validateVariantPriceOverride,
    "variant price",
  );
  const productLifecycleOverrideIndex = buildOverrideIndex(
    productLifecycleOverrides,
    (override) => override.legacy_id ?? override.slug,
    validateLifecycleOverride,
    "product lifecycle",
  );
  const baseOverrideIndexes = { variantPriceOverrideIndex: baseVariantPriceOverrideIndex, productLifecycleOverrideIndex };

  const supplementalEntries = supplementalProducts.map(supplementalToStagingEntry);
  const allEntries = [...(staging.entries ?? []), ...supplementalEntries];
  const preliminaryProducts = allEntries
    .map((entry) => reconcileProduct(entry, baseOverrideIndexes))
    .sort((left, right) => stableCompare(productIdentity({ legacy_id: left.legacy_id, product: left.target_product }), productIdentity({ legacy_id: right.legacy_id, product: right.target_product })));
  const comboMaterialization = reconcileComboMaterialization(allEntries, preliminaryProducts, comboEvidence);
  const variantPriceOverrideIndex = buildOverrideIndex(
    [...variantPriceOverrides, ...comboMaterialization.priceOverrides],
    (override) => variantIdentityKey(override.legacy_id ?? override.slug, override),
    validateVariantPriceOverride,
    "variant price",
  );
  const products = allEntries
    .map((entry) => reconcileProduct(entry, { variantPriceOverrideIndex, productLifecycleOverrideIndex }))
    .sort((left, right) => stableCompare(productIdentity({ legacy_id: left.legacy_id, product: left.target_product }), productIdentity({ legacy_id: right.legacy_id, product: right.target_product })));
  const conflicts = [
    ...globalConflicts(staging, products, documentedBottlePriceCount),
    ...comboMaterialization.conflicts,
  ].sort((left, right) => stableCompare(`${left.code}:${left.detail}`, `${right.code}:${right.detail}`));
  const globallyBlockedIds = new Set(conflicts.flatMap((conflict) => conflict.legacy_ids));
  for (const product of products) {
    if (globallyBlockedIds.has(product.legacy_id)) {
      product.migration_status = "BLOCKED";
      product.publish_eligibility = "BLOCKED";
      product.blockers = [...new Set([...product.blockers, "GLOBAL_RECONCILIATION_CONFLICT"])].sort(stableCompare);
    }
  }

  const blocked = [
    // A blocked combo stays BLOCKED for migration/publish either way (Part G:
    // do not weaken readiness to force a combo publishable) — but
    // composition_verification_status/source_state/provenance reflect what the
    // upstream staging item actually documents, so an official-PDF-confirmed
    // composition (see etl-legacy-catalog.mjs's officialPdfMembers handling)
    // is not left indistinguishable from a genuinely still-pending one.
    ...(staging.blocked ?? []).map((item) => ({
      legacy_id: item.legacy_id ?? null,
      entity: "combo",
      migration_status: "BLOCKED",
      publish_eligibility: "BLOCKED",
      reason: item.reason,
      target_tables: [],
      provenance: item.composition_verification_status === "official_pdf" ? ["OFFICIAL_PDF"] : ["UNKNOWN"],
      composition_verification_status: item.composition_verification_status ?? "pending_reconfirmation",
      source_state: item.source_state ?? "CLIENT_PROVIDED_PENDING_RECONFIRMATION",
      ...(item.composition_legacy_ids ? { composition_legacy_ids: item.composition_legacy_ids } : {}),
      ...(item.decant_price_3_5_10 ? { decant_price_3_5_10: item.decant_price_3_5_10 } : {}),
    })),
    ...(staging.invalid ?? []).map((item) => ({
      legacy_id: item.legacy_id ?? null,
      entity: "product",
      migration_status: "BLOCKED",
      publish_eligibility: "BLOCKED",
      reason: (item.problems ?? []).join("; "),
      target_tables: [],
      provenance: ["UNKNOWN"],
    })),
  ].sort((left, right) => stableCompare(`${left.entity}:${left.legacy_id}`, `${right.entity}:${right.legacy_id}`));

  const uniqueCategories = new Map();
  for (const product of products) for (const category of product.categories) if (category.target_slug) uniqueCategories.set(`${category.kind}:${category.target_slug}`, category);
  const categoryTargets = [...uniqueCategories.values()].map((category) => ({
    kind: category.kind,
    slug: category.target_slug,
    name: targetCategoryName({ kind: category.kind, slug: category.source_slug }),
    description: null,
    spec_schema: {},
    publication_status: "draft",
    sort_order: 0,
    field_provenance: {
      slug: category.kind === "commercial_type"
        ? evidence(["CLIENT_CONFIRMED", "DERIVED_VALIDATED"], "Stable commercial identities are confirmed by the wholesale contract and normalized from legacy source")
        : evidence(["legacy", "DERIVED_VALIDATED"], "ASCII-safe slug derived deterministically from the legacy olfactory-family label"),
      name: category.kind === "commercial_type"
        ? evidence(["CLIENT_CONFIRMED"], "Commercial category label is documented in the confirmed wholesale contract")
        : evidence(["legacy"], "Display label preserved from the legacy olfactory-family value"),
    },
  })).sort((left, right) => stableCompare(`${left.kind}:${left.slug}`, `${right.kind}:${right.slug}`));
  const count = (predicate) => products.filter(predicate).length;
  const variants = products.flatMap((product) => product.variants);
  const comboPresentations = comboMaterialization.targets.reduce((total, combo) => total + combo.presentations.length, 0);
  const comboItems = comboMaterialization.targets.reduce(
    (total, combo) => total + combo.presentations.reduce((subtotal, presentation) => subtotal + presentation.items.length, 0),
    0,
  );
  const overrideCount = Object.values(FIELD_OVERRIDES).reduce((total, fields) => total + Object.keys(fields).length, 0) + Object.keys(CATEGORY_PROVENANCE_OVERRIDES).length;
  const summary = {
    legacy_products_considered: products.length + blocked.length,
    staged_non_combo_products: products.length,
    migratable_draft: count((product) => product.migration_status === "MIGRATABLE_DRAFT"),
    migratable_with_verified_fields: count((product) => product.migration_status === "MIGRATABLE_WITH_VERIFIED_FIELDS"),
    blocked: blocked.length + count((product) => product.migration_status === "BLOCKED"),
    excluded: count((product) => product.migration_status === "EXCLUDED"),
    variants: variants.length,
    legacy_price_variants: variants.filter((variant) => variant.price_verification_status === "legacy").length,
    official_pdf_price_variants: variants.filter((variant) => variant.price_verification_status === "official_pdf").length,
    provisional_market_price_variants: variants.filter((variant) => variant.price_verification_status === "provisional_market").length,
    confirmed_price_variants: variants.filter((variant) => variant.price_verification_status === "client_confirmed" || variant.price_verification_status === "official_pdf").length,
    legacy_bottle_price_variants: variants.filter((variant) => variant.variant_kind === "bottle" && variant.price_verification_status === "legacy").length,
    confirmed_bottle_price_variants: variants.filter((variant) => variant.variant_kind === "bottle" && (variant.price_verification_status === "client_confirmed" || variant.price_verification_status === "official_pdf")).length,
    provisional_market_bottle_price_variants: variants.filter((variant) => variant.variant_kind === "bottle" && variant.price_verification_status === "provisional_market").length,
    commercial_categories: [...uniqueCategories.keys()].filter((key) => key.startsWith("commercial_type:")).length,
    olfactory_categories: [...uniqueCategories.keys()].filter((key) => key.startsWith("olfactory_family:")).length,
    category_relationships: products.reduce((total, product) => total + product.categories.length, 0),
    combo_targets: comboMaterialization.targets.length,
    combo_presentations: comboPresentations,
    combo_items: comboItems,
    status_overrides: products.filter((product) => product.target_product.publication_status === "hidden").length,
    provenance_overrides: overrideCount,
    conflicts: conflicts.length,
  };

  return {
    metadata: {
      notice: "STAGING RECONCILIATION ONLY — no database writes, publication, storefront cutover, or media migration",
      artifact_version: 1,
      business_unit_code: "parfums",
      source_artifact: "supabase/staging/legacy-catalog-staging.json",
      source_fingerprints: Object.fromEntries(Object.entries(sourceFingerprints).sort(([left], [right]) => stableCompare(left, right))),
      status_vocabulary: {
        migration_status: MIGRATION_STATUSES,
        publish_eligibility: PUBLISH_ELIGIBILITIES,
        provenance: PROVENANCE_VALUES,
      },
      conservative_verification_rule: "Field-level evidence stays detailed here; products.verification_status remains legacy whenever the record contains mixed legacy and stronger provenance.",
      existing_supabase_rows: {
        status: "NOT_VERIFIED",
        reason: "Artifact-first phase; no remote database credentials or inspection are required to validate versioned source/schema inputs.",
      },
      media_write_status: "DEFERRED_TO_4F2B",
    },
    summary,
    category_targets: categoryTargets,
    products,
    combo_targets: comboMaterialization.targets,
    blocked,
    conflicts,
  };
}

export function serializeCommercialReconciliation(artifact) {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

async function buildArtifact() {
  const sources = await Promise.all(Object.entries({
    "assets/data.js": paths.legacySource,
    "docs/client-decisions.md": paths.decisions,
    "supabase/migrations/20260907154348_catalog.sql": paths.catalogSchema,
    "supabase/migrations/20260907154401_integrity_hardening.sql": paths.integritySchema,
    "supabase/migrations/20260908070000_admin_parfums_wholesale.sql": paths.wholesaleSchema,
    "supabase/staging/legacy-catalog-staging.json": paths.legacyStaging,
    "supabase/staging/pdf-2026-commercial-reconciliation.json": paths.pdfReconciliation,
  }).map(async ([name, path]) => [name, await readFile(path, "utf8")]));
  const sourceMap = Object.fromEntries(sources);
  const sourceFingerprints = Object.fromEntries(sources.map(([name, raw]) => [name, sha256(raw)]));
  const staging = JSON.parse(sourceMap["supabase/staging/legacy-catalog-staging.json"]);
  if (staging.metadata?.sourceSha256 !== sourceFingerprints["assets/data.js"]) {
    throw new Error("Legacy staging input is stale relative to assets/data.js. Run the existing legacy ETL first.");
  }
  return reconcileCommercialCatalog({
    staging,
    sourceFingerprints,
    documentedBottlePriceCount: DOCUMENTED_BOTTLE_PRICE_COUNT,
  });
}

async function main() {
  const artifact = await buildArtifact();
  const output = serializeCommercialReconciliation(artifact);
  if (process.argv.includes("--check")) {
    const current = await readFile(paths.output, "utf8").catch(() => null);
    if (current === null) throw new Error("Commercial reconciliation artifact is missing. Run node scripts/commercial-reconciliation.mjs.");
    if (current !== output) throw new Error("Commercial reconciliation artifact is stale. Re-run the generator and commit the result.");
    console.log("Commercial reconciliation artifact is byte-stable and current.");
  } else {
    await writeFile(paths.output, output, "utf8");
    console.log(`Wrote ${paths.output}`);
  }
  console.log(`Commercial reconciliation — products: ${artifact.summary.staged_non_combo_products}, variants: ${artifact.summary.variants}, blocked: ${artifact.summary.blocked}, conflicts: ${artifact.summary.conflicts}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
