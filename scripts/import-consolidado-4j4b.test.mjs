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
