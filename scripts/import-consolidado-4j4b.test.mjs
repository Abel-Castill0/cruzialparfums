import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildCanonicalManifest, buildPopulationPlan, mapAvailability } from "./lib/import-consolidado-plan.mjs";
import { buildOperatorSql, loadPlan, parseArgs, resolveTarget, STAGING_DATABASE_URL_ENV, validateStagingDatabaseUrl } from "./load-import-consolidado.mjs";

const reviewedPath = new URL("../supabase/staging/import/sexto-consolidado-reviewed.json", import.meta.url);
const overridesPath = new URL("../supabase/staging/import/sexto-consolidado-population-overrides.json", import.meta.url);

async function inputs() {
  const reviewedRaw = await readFile(reviewedPath, "utf8");
  const overridesRaw = await readFile(overridesPath, "utf8");
  const reviewed = JSON.parse(reviewedRaw);
  const overrides = JSON.parse(overridesRaw);
  reviewed._sha256 = createHash("sha256").update(reviewedRaw).digest("hex");
  overrides._sha256 = createHash("sha256").update(overridesRaw).digest("hex");
  return { reviewed, overrides };
}

test("routing requires an explicit supported target and exactly one mode", () => {
  assert.deepEqual(parseArgs(["node", "loader", "--target", "local", "--apply"]), { target: "local", mode: "apply" });
  assert.deepEqual(parseArgs(["node", "loader", "--target", "staging", "--verify"]), { target: "staging", mode: "verify" });
  assert.throws(() => parseArgs(["node", "loader", "--apply"]), /never inferred/u);
  assert.throws(() => parseArgs(["node", "loader", "--target", "production", "--apply"]), /Production is unsupported/u);
});

test("staging never falls back to local and validates the hosted project identity", () => {
  assert.throws(() => resolveTarget("staging", {}), new RegExp(STAGING_DATABASE_URL_ENV));
  assert.throws(() => validateStagingDatabaseUrl("postgresql://postgres:secret@127.0.0.1:54322/postgres"), /Refusing to connect/u);
  assert.throws(() => validateStagingDatabaseUrl("postgresql://postgres.iyxidhglyqkzoziyewlc:secret@example.com:6543/postgres"), /Refusing to connect/u);
  const url = "postgresql://postgres.iyxidhglyqkzoziyewlc:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
  assert.equal(validateStagingDatabaseUrl(url), url);
});

test("shared plan is deterministic, UUID-free, and preserves reviewed structure", async () => {
  const { reviewed, overrides } = await inputs();
  const first = buildCanonicalManifest(reviewed, overrides, buildPopulationPlan(reviewed, overrides));
  const second = buildCanonicalManifest(reviewed, overrides, buildPopulationPlan(reviewed, overrides));
  const a = JSON.stringify(first, null, 2) + "\n";
  const b = JSON.stringify(second, null, 2) + "\n";
  assert.equal(a, b);
  assert.equal(createHash("sha256").update(a).digest("hex"), createHash("sha256").update(b).digest("hex"));
  assert.doesNotMatch(a, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu);
  assert.equal(first.stats.products, 844);
  assert.equal(first.stats.structural_presentations, 912);
  assert.equal(first.stats.priced_offers, 898);
  for (const slug of ["import-vanilla-freak-a2d9b01f", "import-cdn-preciux-iv-63f7d95b"]) {
    const product = first.products.find((item) => item.slug === slug);
    assert.ok(product);
    assert.equal(first.presentations.filter((item) => item.product_canonical_id === product.canonical_id).length, 1);
    assert.equal(first.offers.filter((item) => item.product_canonical_id === product.canonical_id).length, 0);
  }
});

// Named-case regression coverage for the 4J4B override resolutions. This
// used to live only as a live-database pgTAP check (supabase/tests/21_...)
// that asserted "actual database state after loader apply" — which made the
// normal `supabase db reset && supabase test db` gate non-hermetic (it
// required the Sexto loader to have already populated local Postgres).
// The same guarantees are proven here against the deterministic plan output
// directly — no DB, no loader run required. DB-level invariants that are
// genuinely schema/constraint concerns (no duplicate campaign_products
// identity, no null price/presentation) stay covered by the hermetic
// fixture-level pgTAP suite (see supabase/tests/17-20). Live-population
// verification against a real database remains available via the operator's
// `--verify` mode; see supabase/tests-manual/README.md.
test("override resolutions: named split-identity and reassociation regressions", async () => {
  const { reviewed, overrides } = await inputs();
  const manifest = buildCanonicalManifest(reviewed, overrides, buildPopulationPlan(reviewed, overrides));
  const bySlugPrefix = (prefix) => manifest.products.filter((item) => item.slug.startsWith(prefix));
  const presentationsOf = (product) => manifest.presentations.filter((item) => item.product_canonical_id === product.canonical_id);
  const offersOf = (product) => manifest.offers.filter((item) => item.product_canonical_id === product.canonical_id);

  // Accento: split_canonical_source_identity — two distinct products, each
  // with its own offer at its own price (S/710 and S/720).
  const accento = bySlugPrefix("import-accento-");
  assert.equal(accento.length, 2, "Accento produces 2 distinct products");
  assert.deepEqual(
    accento.flatMap((product) => offersOf(product).map((offer) => offer.price_amount)).sort(),
    ["710.00", "720.00"],
    "Accento offers are priced S/710 and S/720",
  );
  for (const product of accento) assert.equal(offersOf(product).length, 1, "each Accento product has exactly one offer");

  // Arabia Heroes: split_canonical_source_identity — two distinct products.
  assert.equal(bySlugPrefix("import-arabia-heroes-").length, 2, "Arabia Heroes produces 2 distinct products");

  // GOS Rouge: split_structural_presentations — one product, two priced
  // presentations (100ml and Extrait de Parfum).
  const gosRouge = manifest.products.find((item) => item.name === "GOS Rouge");
  assert.ok(gosRouge, "GOS Rouge product exists");
  const gosRougePresentations = presentationsOf(gosRouge);
  assert.equal(gosRougePresentations.length, 2, "GOS Rouge has 2 distinct presentations");
  assert.ok(gosRougePresentations.some((item) => item.label === "100ml"), "GOS Rouge has a 100ml presentation");
  assert.ok(gosRougePresentations.some((item) => item.label.startsWith("Extrait")), "GOS Rouge has an Extrait presentation");

  // Black XS: split_structural_presentations — EDT and EDP presentations
  // under a single product.
  const blackXs = manifest.products.find((item) => item.slug.startsWith("import-black-xs-edt-"));
  assert.ok(blackXs, "Black XS product exists");
  const blackXsPresentations = presentationsOf(blackXs);
  assert.equal(blackXsPresentations.length, 2, "Black XS has EDT and EDP presentations");
  assert.ok(blackXsPresentations.some((item) => item.label.includes("EDT")));
  assert.ok(blackXsPresentations.some((item) => item.label.includes("EDP")));

  // Miss Dior EDP: split_structural_presentations — Retail and Tester.
  const missDiorEdp = manifest.products.find((item) => item.name === "Miss Dior EDP");
  assert.ok(missDiorEdp, "Miss Dior EDP product exists");
  const missDiorPresentations = presentationsOf(missDiorEdp);
  assert.equal(missDiorPresentations.length, 2, "Miss Dior EDP has Retail and Tester presentations");
  assert.ok(missDiorPresentations.some((item) => item.label.startsWith("Retail")));
  assert.ok(missDiorPresentations.some((item) => item.label.startsWith("Tester")));

  // Infrared EDP: correct_source_block_association — the reconciled S/330
  // offer belongs to the EDP · 90ml presentation, not SpiceBomb EDT (the
  // override this manifest is built from explicitly corrects this).
  const infrared = manifest.products.find((item) => item.name === "Infrared EDP");
  assert.ok(infrared, "Infrared EDP product exists");
  const infraredEdpPresentation = presentationsOf(infrared).find((item) => item.label.includes("EDP") && item.label.includes("90ml"));
  assert.ok(infraredEdpPresentation, "Infrared EDP has an EDP · 90ml presentation");
  const infraredEdpOffer = offersOf(infrared).find((item) => item.pres_stable_key === infraredEdpPresentation.stable_key);
  assert.equal(infraredEdpOffer?.price_amount, "330.00", "Infrared EDP · 90ml offer is priced S/330");

  // CDN Preciux IV: omit_offer_pending_price_confirmation — structure
  // survives, no offer is generated for the unresolved price conflict.
  const cdnPreciuxIv = manifest.products.find((item) => item.slug.startsWith("import-cdn-preciux-iv-"));
  assert.ok(cdnPreciuxIv, "CDN Preciux IV product exists");
  assert.deepEqual(presentationsOf(cdnPreciuxIv).map((item) => item.label), ["55ml"], "CDN Preciux IV retains its 55ml presentation");
  assert.equal(offersOf(cdnPreciuxIv).length, 0, "CDN Preciux IV has no campaign offer");
});

test("availability mapping is fail-closed and exact money stays text", async () => {
  assert.equal(mapAvailability(null), "unconfirmed");
  assert.equal(mapAvailability("UNKNOWN"), "unconfirmed");
  assert.equal(mapAvailability("out_of_stock"), "out_of_stock");
  assert.equal(mapAvailability("OUT_OF_STOCK"), "out_of_stock");
  assert.equal(mapAvailability("available"), "available");
  const { plan } = await loadPlan();
  assert.ok(plan.offers.every((offer) => typeof offer.price_amount === "string"));
  assert.ok(plan.offers.every((offer) => /^\d{1,10}(?:\.\d{1,2})?$/u.test(offer.price_amount)));
});

test("operator SQL is atomic, natural-identity scoped, and has no synthetic auth", async () => {
  const { manifest } = await loadPlan();
  const sql = buildOperatorSql(manifest, "apply");
  assert.match(sql, /^BEGIN;/u);
  assert.match(sql, /COMMIT;$/u);
  assert.match(sql, /pg_advisory_xact_lock/u);
  assert.match(sql, /population_conflicts/u);
  assert.match(sql, /business_units WHERE code='import'/u);
  assert.match(sql, /c\.number=6/u);
  assert.match(sql, /price_amount::numeric/u);
  assert.match(sql, /SET LOCAL ROLE anon/u);
  assert.doesNotMatch(sql, /auth\.users|admin_memberships|loader@test|import-admin-4j4b/iu);
  assert.doesNotMatch(sql, /ON CONFLICT DO UPDATE/iu);
});
