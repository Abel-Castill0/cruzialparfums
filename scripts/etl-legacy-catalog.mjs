/**
 * Cruzial Platform V2 — legacy catalogue ETL (staging only)
 *
 * assets/data.js  ->  supabase/staging/legacy-catalog-staging.json
 *
 * This script does NOT write to Postgres and does NOT perform a cutover. It
 * produces the rows a future loader would insert, so the diff can be reviewed
 * before anything touches the database.
 *
 * Two rules shape every decision here:
 *
 *   1. Legacy parity is not client confirmation. Every product is staged as
 *      publication_status 'draft' with verification_status 'legacy', and every
 *      price keeps price_verification_status 'legacy'. Nothing in this file may
 *      promote an unverified legacy value into a published commercial fact —
 *      that promotion is a human decision, recorded in
 *      docs/client-decisions.md.
 *
 *   2. It is idempotent. Rows are compared against the previous staging
 *      artifact, so a second run reports everything as `unchanged` rather than
 *      re-creating it.
 *
 * Usage:
 *   node scripts/etl-legacy-catalog.mjs           # write staging + report
 *   node scripts/etl-legacy-catalog.mjs --check   # fail if staging is stale
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const sourcePath = resolve(repositoryRoot, "assets/data.js");
const stagingPath = resolve(
  repositoryRoot,
  "supabase/staging/legacy-catalog-staging.json",
);

// Fixed in 20260907154344_foundation.sql so staging output is stable across a
// `supabase db reset`.
const BUSINESS_UNIT_IDS = Object.freeze({
  parfums: "11111111-1111-4111-8111-111111111111",
  import: "22222222-2222-4222-8222-222222222222",
});

const DECANT_SIZES = [3, 5, 10];

function loadLegacyWindow(source) {
  const legacyWindow = Object.create(null);
  vm.runInNewContext(source, { window: legacyWindow }, {
    filename: "assets/data.js",
    timeout: 1_000,
  });
  return legacyWindow;
}

function isPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Structural validation. A row that fails here cannot be represented at all,
 * as opposed to one that is merely not approved for publication.
 *
 * The legacy shape stores both price maps as objects keyed by size:
 *   price:  { "3": 12, "5": 16, "10": 26 }
 *   bottle: { "100": 380 }
 */
function validate(product, seenSlugs) {
  const problems = [];

  if (!product.id) problems.push("missing legacy id");
  if (!product.name) problems.push("missing name");
  if (product.id && seenSlugs.has(product.id)) problems.push("duplicate legacy id");

  const decantPrices = product.price ?? {};
  for (const size of DECANT_SIZES) {
    const price = decantPrices[size];
    if (price !== undefined && !isPositiveNumber(price)) {
      problems.push(`non-numeric ${size}ml price`);
    }
  }

  for (const [size, price] of Object.entries(product.bottle ?? {})) {
    if (!isPositiveNumber(price)) problems.push(`non-numeric ${size}ml bottle price`);
  }

  return problems;
}

function buildVariants(product) {
  const variants = [];
  const decantPrices = product.price ?? {};

  for (const size of DECANT_SIZES) {
    const price = decantPrices[size];
    if (!isPositiveNumber(price)) continue;
    variants.push({
      label: `${size} ml`,
      variant_kind: "decant",
      size_ml: size,
      price_amount: price,
      currency: "PEN",
      // Draft, always: a variant that loads as published would put an
      // unconfirmed legacy price straight onto the storefront.
      publication_status: "draft",
      price_verification_status: "legacy",
      sort_order: DECANT_SIZES.indexOf(size),
    });
  }

  const bottleSizes = Object.keys(product.bottle ?? {})
    .map((size) => Number(size))
    .filter((size) => Number.isFinite(size))
    .sort((a, b) => a - b);

  for (const [index, size] of bottleSizes.entries()) {
    const price = product.bottle[String(size)];
    if (!isPositiveNumber(price)) continue;
    variants.push({
      label: `Frasco ${size} ml`,
      variant_kind: "bottle",
      size_ml: size,
      price_amount: price,
      currency: "PEN",
      publication_status: "draft",
      price_verification_status: "legacy",
      sort_order: DECANT_SIZES.length + index,
    });
  }

  return variants;
}

/**
 * Media pointers only. Nothing is uploaded, converted or moved: the client's
 * originals under img/perfumes/ stay exactly where they are.
 */
function buildMedia(product) {
  const media = [];
  const seen = new Set();

  const candidates = [
    { url: product.img, isPrimary: true },
    { url: product.imgBottle, isPrimary: false },
    { url: product.imgSet, isPrimary: false },
  ];

  for (const [index, candidate] of candidates.entries()) {
    if (!candidate.url || seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    media.push({
      provider: "legacy_static",
      secure_url: candidate.url,
      alt: `${product.brand ?? ""} ${product.name}`.trim(),
      is_primary: candidate.isPrimary && media.length === 0,
      sort_order: index,
    });
  }

  return media;
}

function buildProductRow(product) {
  return {
    business_unit_id: BUSINESS_UNIT_IDS.parfums,
    legacy_id: product.id,
    slug: product.id,
    name: product.name,
    brand: product.brand ?? null,
    description: product.desc ?? null,
    gender: product.gender ?? null,
    concentration: product.conc ?? null,
    sales_mode: "always_available",
    // discontinued is about the house, availability is about our stock, and
    // hidden is about visibility. client-decisions.md 2026-09-06 confirms a
    // discontinued product can still be available and sellable, so these never
    // collapse into one flag.
    production_status: product.discontinued ? "discontinued" : "active",
    availability_status: product.outOfStock ? "out_of_stock" : "available",
    publication_status: "draft",
    is_featured: Boolean(product.isFeatured),
    featured_rank: product.isFeatured ? (product.featuredRank ?? null) : null,
    featured_from: product.featuredFrom ?? null,
    featured_until: product.featuredUntil ?? null,
    verification_status: "legacy",
    specs: {
      family: product.family ?? null,
      notes: product.notes ?? [],
      tag: product.tag ?? null,
      legacy_hidden: Boolean(product.hidden),
      // Kept as legacy provenance only. `bestseller` is a sales claim with no
      // documented source, so it is never mapped onto is_featured or shown as
      // fact — see the ZERO INVENTED COMMERCE rule in CLAUDE.md.
      legacy_bestseller_unverified: Boolean(product.bestseller),
    },
  };
}

function categoriesFor(product) {
  const rows = [];
  if (product.type && product.type !== "combo") {
    rows.push({ kind: "commercial_type", slug: product.type });
  }
  if (product.family) {
    rows.push({ kind: "olfactory_family", slug: String(product.family).toLowerCase() });
  }
  return rows;
}

function fingerprint(entry) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        product: entry.product,
        variants: entry.variants,
        categories: entry.categories,
        media: entry.media,
      }),
    )
    .digest("hex");
}

async function readPreviousStaging() {
  try {
    const raw = await readFile(stagingPath, "utf8");
    const parsed = JSON.parse(raw);
    const byLegacyId = new Map();
    for (const entry of parsed.entries ?? []) {
      byLegacyId.set(entry.legacy_id, entry);
    }
    return { raw, byLegacyId };
  } catch {
    return { raw: null, byLegacyId: new Map() };
  }
}

async function build() {
  const source = await readFile(sourcePath, "utf8");
  const legacyWindow = loadLegacyWindow(source);
  const products = legacyWindow.CRUZIAL_PRODUCTS ?? [];
  const previous = await readPreviousStaging();

  const seenIds = new Set();
  const entries = [];
  const report = { created: 0, updated: 0, unchanged: 0, blocked: 0, invalid: 0 };
  const blocked = [];
  const invalid = [];

  for (const product of products) {
    const problems = validate(product, seenIds);
    if (product.id) seenIds.add(product.id);

    if (problems.length > 0) {
      report.invalid += 1;
      invalid.push({ legacy_id: product.id ?? null, problems });
      continue;
    }

    // Combos carry a composition that is still
    // CLIENT_PROVIDED_PENDING_RECONFIRMATION, so they are reported rather than
    // staged: loading them would imply a verified set.
    if (product.type === "combo") {
      report.blocked += 1;
      blocked.push({
        legacy_id: product.id,
        reason: "combo composition is CLIENT_PROVIDED_PENDING_RECONFIRMATION",
      });
      continue;
    }

    const variants = buildVariants(product);
    if (variants.length === 0) {
      report.blocked += 1;
      blocked.push({ legacy_id: product.id, reason: "no usable price on any variant" });
      continue;
    }

    const entry = {
      legacy_id: product.id,
      product: buildProductRow(product),
      variants,
      categories: categoriesFor(product),
      media: buildMedia(product),
    };
    entry.fingerprint = fingerprint(entry);

    const before = previous.byLegacyId.get(product.id);
    if (!before) report.created += 1;
    else if (before.fingerprint !== entry.fingerprint) report.updated += 1;
    else report.unchanged += 1;

    entries.push(entry);
  }

  entries.sort((a, b) => a.legacy_id.localeCompare(b.legacy_id));

  const artifact = {
    metadata: {
      notice: "STAGING ONLY — not applied to any database, not a cutover",
      generatedFrom: "assets/data.js",
      sourceSha256: createHash("sha256").update(source).digest("hex"),
      // Recorded so a later loader cannot mistake parity for approval.
      verificationStatus: "legacy",
      publishEligible: false,
      stagedProductPublicationStatus: "draft",
      // Content-derived counts belong in the committed artifact. The
      // created/updated/unchanged delta is intentionally console-only because
      // it depends on the previous artifact; persisting it made a successful
      // write immediately fail --check until the ETL was run a second time.
      counts: {
        staged: entries.length,
        blocked: blocked.length,
        invalid: invalid.length,
      },
    },
    blocked,
    invalid,
    entries,
  };

  return { artifact, previousRaw: previous.raw, report };
}

const { artifact, previousRaw, report } = await build();
const serialized = `${JSON.stringify(artifact, null, 2)}\n`;

if (process.argv.includes("--check")) {
  if (previousRaw === null) {
    throw new Error("Staging artifact is missing. Run node scripts/etl-legacy-catalog.mjs.");
  }
  if (previousRaw !== serialized) {
    throw new Error("Staging artifact is stale. Re-run the ETL and commit the result.");
  }
  console.log("Legacy catalog staging artifact is deterministic and current.");
} else {
  await mkdir(dirname(stagingPath), { recursive: true });
  await writeFile(stagingPath, serialized, "utf8");
  console.log(`Wrote ${stagingPath}`);
}

console.log(
  `ETL report — created: ${report.created}, updated: ${report.updated}, ` +
    `unchanged: ${report.unchanged}, blocked: ${report.blocked}, invalid: ${report.invalid}`,
);
