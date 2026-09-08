/**
 * Cruzial Platform V2 — local controlled commercial loader.
 *
 * The script talks only to the PostgreSQL container named by the local
 * supabase/config.toml project_id. It has no hosted URL/key path.
 *
 * Usage:
 *   node scripts/load-commercial-catalog.mjs --dry-run
 *   node scripts/load-commercial-catalog.mjs --apply
 *   node scripts/load-commercial-catalog.mjs --verify
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const manifestPath = resolve(repositoryRoot, "supabase/staging/commercial-reconciliation.json");
const configPath = resolve(repositoryRoot, "supabase/config.toml");

function commandMode(argv) {
  const modes = ["--dry-run", "--apply", "--verify"].filter((mode) => argv.includes(mode));
  if (modes.length !== 1) throw new Error("Choose exactly one mode: --dry-run, --apply, or --verify.");
  return modes[0];
}

function projectIdFromConfig(config) {
  const match = config.match(/^project_id\s*=\s*"([a-zA-Z0-9_-]+)"\s*$/mu);
  if (!match) throw new Error("supabase/config.toml has no safe local project_id.");
  return match[1];
}

function runDocker(args, options = {}) {
  const result = spawnSync("docker", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `docker exited ${result.status}`).trim());
  }
  return result.stdout;
}

function assertLocalDatabase(container) {
  const running = runDocker(["inspect", "--format={{.State.Running}}", container]).trim();
  if (running !== "true") throw new Error(`Local Supabase database container is not running: ${container}`);
  const health = runDocker(["inspect", "--format={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}", container]).trim();
  if (health !== "healthy") throw new Error(`Local Supabase database is not healthy: ${health}`);
}

function runPsql(container, sql) {
  return runDocker([
    "exec", "-i", container,
    "psql", "--username=postgres", "--dbname=postgres",
    "--quiet", "--no-align", "--tuples-only", "--set=ON_ERROR_STOP=1",
  ], { input: sql });
}

function dollarQuote(value) {
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 16);
  let tag = `manifest_${digest}`;
  while (value.includes(`$${tag}$`)) tag += "x";
  return `$${tag}$${value}$${tag}$`;
}

function parseJsonOutput(output) {
  const candidate = output.trim().split(/\r?\n/u).reverse().find((line) => line.trim().startsWith("{"));
  if (!candidate) throw new Error(`Local database returned no JSON result: ${output.trim()}`);
  return JSON.parse(candidate);
}

function invokeImport(container, manifestRaw, apply) {
  const functionName = apply
    ? "app.apply_parfums_commercial_import"
    : "app.plan_parfums_commercial_import";
  const output = runPsql(
    container,
    `select ${functionName}(${dollarQuote(manifestRaw)}::jsonb)::text;\n`,
  );
  return parseJsonOutput(output);
}

function printPlan(plan) {
  console.log(`Commercial loader ${plan.mode}: applied=${plan.applied}, refused=${plan.refused}, conflicts=${plan.conflict_count}`);
  for (const entity of ["categories", "products", "variants", "relationships", "inventory"]) {
    const operation = plan.operations[entity];
    console.log(`${entity}: insert=${operation.insert}, unchanged=${operation.unchanged}, conflict=${operation.conflict}`);
  }
  for (const conflict of plan.conflicts) {
    console.log(`CONFLICT ${conflict.entity}/${conflict.code}: ${conflict.identity}`);
  }
}

function verificationQuery(manifestRaw) {
  const manifest = dollarQuote(manifestRaw);
  return `
with manifest as (select ${manifest}::jsonb as payload),
expected_products as (
  select value->>'legacy_id' as legacy_id
  from manifest, jsonb_array_elements(payload->'products')
),
expected_categories as (
  select value->>'slug' as slug
  from manifest, jsonb_array_elements(payload->'category_targets')
),
imported_products as (
  select product.* from public.products product
  join public.business_units unit on unit.id = product.business_unit_id and unit.code = 'parfums'
  join expected_products expected on expected.legacy_id = product.legacy_id
),
imported_variants as (
  select variant.* from public.product_variants variant
  join imported_products product on product.id = variant.product_id
)
select jsonb_build_object(
  'products', (select count(*) from imported_products),
  'variants', (select count(*) from imported_variants),
  'categories', (select count(*) from public.categories category
    join public.business_units unit on unit.id = category.business_unit_id and unit.code = 'parfums'
    join expected_categories expected on expected.slug = category.slug),
  'relationships', (select count(*) from public.product_categories relationship
    join imported_products product on product.id = relationship.product_id),
  'inventory', (select count(*) from public.inventory inventory
    join imported_variants variant on variant.id = inventory.product_variant_id),
  'published_products', (select count(*) from imported_products where publication_status = 'published'),
  'published_variants', (select count(*) from imported_variants where publication_status = 'published'),
  'promoted_prices', (select count(*) from imported_variants where price_verification_status <> 'legacy'),
  'combos', (select count(*) from public.combos combo join imported_products product on product.id = combo.product_id),
  'media', (select count(*) from public.product_media media join imported_products product on product.id = media.product_id),
  'bir_intense_hidden', (select count(*) from imported_products where legacy_id = 'bir-intense' and publication_status = 'hidden'),
  'discontinued_available', (select count(*) from imported_products where production_status = 'discontinued' and availability_status = 'available')
)::text;
`;
}

function adminSmokeQuery() {
  return `
begin;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('4b1b0000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'phase-4h1b1-admin@example.test', '', now(), now());
insert into public.admin_memberships (user_id, business_unit_id, role)
select '4b1b0000-0000-4000-8000-000000000001', id, 'admin'
from public.business_units where code = 'parfums';
set local role authenticated;
set local request.jwt.claims to '{"sub":"4b1b0000-0000-4000-8000-000000000001","role":"authenticated"}';
select jsonb_build_object(
  'visible_products', (select count(*) from public.products product join public.business_units unit on unit.id = product.business_unit_id where unit.code = 'parfums'),
  'visible_categories', (select count(*) from public.categories category join public.business_units unit on unit.id = category.business_unit_id where unit.code = 'parfums'),
  'corrected_product', (select jsonb_build_object('name', name, 'brand', brand, 'verification_status', verification_status, 'publication_status', publication_status) from public.products where legacy_id = 'reserve-privee'),
  'normal_product', (select jsonb_build_object('name', name, 'verification_status', verification_status, 'publication_status', publication_status) from public.products where legacy_id = '9pm'),
  'legacy_draft_prices', (select count(*) from public.product_variants variant join public.products product on product.id = variant.product_id where product.legacy_id in ('reserve-privee', '9pm') and variant.price_verification_status = 'legacy' and variant.publication_status = 'draft')
)::text;
rollback;
`;
}

function anonymousSmokeQuery() {
  return `
begin;
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select jsonb_build_object(
  'visible_imported_products', (select count(*) from public.products where legacy_id is not null),
  'visible_draft_categories', (select count(*) from public.categories where publication_status = 'draft')
)::text;
rollback;
`;
}

function assertVerification(manifest, plan, actual, admin, anonymous) {
  const expected = {
    products: manifest.products.length,
    variants: manifest.products.reduce((total, product) => total + product.variants.length, 0),
    categories: manifest.category_targets.length,
    relationships: manifest.products.reduce((total, product) => total + product.categories.length, 0),
    inventory: manifest.products.reduce((total, product) => total + product.variants.length, 0),
  };
  for (const [entity, count] of Object.entries(expected)) {
    if (actual[entity] !== count) throw new Error(`Verification failed for ${entity}: expected ${count}, got ${actual[entity]}`);
    if (plan.operations[entity].insert !== 0 || plan.operations[entity].unchanged !== count || plan.operations[entity].conflict !== 0) {
      throw new Error(`Idempotency verification failed for ${entity}.`);
    }
  }
  for (const guard of ["published_products", "published_variants", "promoted_prices", "combos", "media"]) {
    if (actual[guard] !== 0) throw new Error(`Verification guard failed: ${guard}=${actual[guard]}`);
  }
  if (actual.bir_intense_hidden !== 1) throw new Error("bir-intense is not hidden exactly once.");
  if (actual.discontinued_available !== 3) throw new Error(`Expected 3 discontinued+available products, got ${actual.discontinued_available}.`);
  if (admin.visible_products !== expected.products || admin.visible_categories !== expected.categories) throw new Error("Parfums Admin smoke count mismatch.");
  if (admin.corrected_product?.name !== "Gentleman Réserve Privée" || admin.corrected_product?.brand !== "Givenchy") throw new Error("Corrected-product Admin smoke failed.");
  if (admin.corrected_product?.verification_status !== "legacy" || admin.corrected_product?.publication_status !== "draft") throw new Error("Corrected product was commercially promoted.");
  if (admin.normal_product?.name !== "9 PM" || admin.normal_product?.verification_status !== "legacy" || admin.normal_product?.publication_status !== "draft") throw new Error("Normal legacy-product Admin smoke failed.");
  if (admin.legacy_draft_prices < 1) throw new Error("Admin smoke found no legacy draft prices.");
  if (anonymous.visible_imported_products !== 0 || anonymous.visible_draft_categories !== 0) throw new Error("Anonymous RLS exposed imported draft data.");
}

async function main() {
  const mode = commandMode(process.argv.slice(2));
  const [manifestRaw, config] = await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(configPath, "utf8"),
  ]);
  const manifest = JSON.parse(manifestRaw);
  const container = `supabase_db_${projectIdFromConfig(config)}`;
  assertLocalDatabase(container);

  if (mode === "--dry-run" || mode === "--apply") {
    const plan = invokeImport(container, manifestRaw, mode === "--apply");
    printPlan(plan);
    if (plan.conflict_count > 0 || plan.refused) process.exitCode = 2;
    return;
  }

  const plan = invokeImport(container, manifestRaw, false);
  printPlan(plan);
  if (plan.conflict_count > 0) throw new Error("Cannot verify a conflicted local import.");
  const actual = parseJsonOutput(runPsql(container, verificationQuery(manifestRaw)));
  const admin = parseJsonOutput(runPsql(container, adminSmokeQuery()));
  const anonymous = parseJsonOutput(runPsql(container, anonymousSmokeQuery()));
  assertVerification(manifest, plan, actual, admin, anonymous);
  console.log(`Verification: ${JSON.stringify(actual)}`);
  console.log(`Admin smoke: ${JSON.stringify(admin)}`);
  console.log(`Anonymous RLS smoke: ${JSON.stringify(anonymous)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
