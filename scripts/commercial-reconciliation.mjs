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
});

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
  "UNKNOWN",
  "legacy",
]);

const COMMERCIAL_TYPE_MAP = Object.freeze({
  arab: "arabic",
  arabic: "arabic",
  designer: "designer",
  niche: "niche",
});
const STABLE_COMMERCIAL_TYPES = new Set(["arabic", "designer", "niche"]);
const DOCUMENTED_BOTTLE_PRICE_COUNT = 23;
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

function defaultFieldProvenance() {
  return Object.fromEntries(PRODUCT_FIELDS.map((field) => [
    field,
    field === "short_description"
      ? evidence(["UNKNOWN"], "The legacy staging contract has no short description; the optional target remains null")
      : evidence(["legacy"], "Preserved from the legacy staging artifact without approval promotion"),
  ]));
}

function checkProductConstraints(entry, targetProduct, targetVariants) {
  const conflicts = [];
  const add = (code, detail) => conflicts.push({ code, detail });
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

  if (!entry.legacy_id) add("MISSING_LEGACY_ID", "legacy_id is required for stable reconciliation identity");
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
  if (targetProduct.publication_status === "hidden" && !targetProduct.specs.legacy_hidden) add("HIDDEN_STATUS_CONTRADICTION", "target is hidden without legacy_hidden evidence");
  if (targetProduct.specs.legacy_hidden && targetProduct.publication_status !== "hidden") add("HIDDEN_STATUS_CONTRADICTION", "legacy_hidden must map to the independent hidden publication state");
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
    if (!["legacy", "client_confirmed", "official_pdf", "unknown"].includes(variant.price_verification_status)) add("INVALID_PRICE_VERIFICATION_STATUS", `${variant.label}: ${variant.price_verification_status}`);
  }
  return conflicts;
}

function reconcileProduct(entry) {
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
    publication_status: entry.product.specs?.legacy_hidden ? "hidden" : "draft",
    is_featured: Boolean(entry.product.is_featured),
    featured_rank: entry.product.featured_rank ?? null,
    featured_from: entry.product.featured_from ?? null,
    featured_until: entry.product.featured_until ?? null,
    verification_status: "legacy",
    specs: entry.product.specs ?? {},
  };
  const fieldProvenance = defaultFieldProvenance();
  fieldProvenance.publication_status = evidence(
    ["DERIVED_VALIDATED"],
    "Conservative migration policy maps unapproved products to draft; explicit legacy_hidden maps to the schema's hidden state",
  );
  fieldProvenance.verification_status = evidence(
    ["DERIVED_VALIDATED"],
    "Conservative reduction to legacy because one database column cannot express mixed field-level evidence",
  );

  const overrides = FIELD_OVERRIDES[entry.legacy_id] ?? {};
  for (const [field, provenance] of Object.entries(overrides)) fieldProvenance[field] = provenance;

  const variants = [...(entry.variants ?? [])]
    .map((variant) => ({
      variant_kind: variant.variant_kind,
      size_ml: variant.size_ml ?? null,
      label: variant.label,
      price_amount: variant.price_amount,
      currency: variant.currency,
      publication_status: "draft",
      price_verification_status: variant.price_verification_status,
      sort_order: variant.sort_order,
      price_provenance: evidence([variant.price_verification_status], "Preserved exactly from assets/data.js through the existing legacy ETL"),
      publish_eligibility: variant.price_verification_status === "client_confirmed" || variant.price_verification_status === "official_pdf" ? "NOT_READY" : "NOT_READY",
      blockers: variant.price_verification_status === "legacy" ? ["LEGACY_PRICE_NOT_APPROVED_FOR_PUBLICATION"] : [],
    }))
    .sort((left, right) => left.sort_order - right.sort_order || stableCompare(left.label, right.label));

  const categories = [...(entry.categories ?? [])]
    .map((category) => {
      const targetSlug = targetCategorySlug(category);
      const override = CATEGORY_PROVENANCE_OVERRIDES[`${entry.legacy_id}:${category.kind}`];
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

  const localConflicts = checkProductConstraints(entry, targetProduct, variants);
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
      lookup_key: entry.legacy_id,
      write_status: "DEFERRED_TO_4F2B",
    },
    warnings: warnings.sort(stableCompare),
    blockers: [
      ...(variants.some((variant) => variant.price_verification_status === "legacy") ? ["LEGACY_PRICES_REQUIRE_COMMERCIAL_APPROVAL"] : []),
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
  for (const legacyId of duplicateValues((staging.entries ?? []).map((entry) => entry.legacy_id))) conflicts.push({ code: "DUPLICATE_LEGACY_ID", legacy_ids: [legacyId], detail: legacyId });
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

export function reconcileCommercialCatalog({ staging, sourceFingerprints = {}, documentedBottlePriceCount }) {
  const products = [...(staging.entries ?? [])].map(reconcileProduct).sort((left, right) => stableCompare(left.legacy_id, right.legacy_id));
  const conflicts = globalConflicts(staging, products, documentedBottlePriceCount);
  const globallyBlockedIds = new Set(conflicts.flatMap((conflict) => conflict.legacy_ids));
  for (const product of products) {
    if (globallyBlockedIds.has(product.legacy_id)) {
      product.migration_status = "BLOCKED";
      product.publish_eligibility = "BLOCKED";
      product.blockers = [...new Set([...product.blockers, "GLOBAL_RECONCILIATION_CONFLICT"])].sort(stableCompare);
    }
  }

  const blocked = [
    ...(staging.blocked ?? []).map((item) => ({
      legacy_id: item.legacy_id ?? null,
      entity: "combo",
      migration_status: "BLOCKED",
      publish_eligibility: "BLOCKED",
      reason: item.reason,
      target_tables: [],
      provenance: ["UNKNOWN"],
      composition_verification_status: "pending_reconfirmation",
      source_state: "CLIENT_PROVIDED_PENDING_RECONFIRMATION",
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
  const count = (predicate) => products.filter(predicate).length;
  const variants = products.flatMap((product) => product.variants);
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
    confirmed_price_variants: variants.filter((variant) => variant.price_verification_status === "client_confirmed" || variant.price_verification_status === "official_pdf").length,
    legacy_bottle_price_variants: variants.filter((variant) => variant.variant_kind === "bottle" && variant.price_verification_status === "legacy").length,
    confirmed_bottle_price_variants: variants.filter((variant) => variant.variant_kind === "bottle" && (variant.price_verification_status === "client_confirmed" || variant.price_verification_status === "official_pdf")).length,
    commercial_categories: [...uniqueCategories.keys()].filter((key) => key.startsWith("commercial_type:")).length,
    olfactory_categories: [...uniqueCategories.keys()].filter((key) => key.startsWith("olfactory_family:")).length,
    category_relationships: products.reduce((total, product) => total + product.categories.length, 0),
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
    products,
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
