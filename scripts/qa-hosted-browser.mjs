/** Hosted-QA browser runner: the local runner's contract, pointed at the disposable QA Supabase project.
 *
 * Usage (from the repo root):
 *   node scripts/qa-hosted-browser.mjs --check            prove the target is QA (static + DB marker)
 *   node scripts/qa-hosted-browser.mjs --reset            reset the QA database to the repo migrations
 *   node scripts/qa-hosted-browser.mjs --build            build apps/web against QA
 *   node scripts/qa-hosted-browser.mjs --seed [pw args]   load synthetic fixtures, then run Playwright
 *   node scripts/qa-hosted-browser.mjs [pw args]          run Playwright against a local server + QA backend
 *
 * Configuration comes only from a git-ignored env file (CRUZIAL_QA_ENV_FILE, default `.env.qa`):
 *   QA_PROJECT_REF, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY,
 *   QA_DATABASE_URL (the QA-only `qa_runner` login, via the pooler: table grants + BYPASSRLS in QA, no `auth` rights).
 * Every write is preceded by the qa_env.marker guard (apps/web/e2e/qa-target.mjs). Production refs are
 * refused before any network call. Synthetic data only; no WhatsApp credential is ever passed through;
 * Cloudinary is replaced by the same non-credential placeholders as the local runner (specs intercept it).
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, cpSync, rmSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnvFile, validateQaTarget, qaMarkerGuardSql, dockerPsqlArgs, isProductionRef } from "../apps/web/e2e/qa-target.mjs";
import { ensureIdentities } from "./lib/e2e-identities.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const web = fileURLToPath(new URL("../apps/web/", import.meta.url));
const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");

const envFile = process.env.CRUZIAL_QA_ENV_FILE || join(root, ".env.qa");
if (!existsSync(envFile)) throw new Error("QA env file not found (set CRUZIAL_QA_ENV_FILE or create .env.qa).");
const target = validateQaTarget(parseEnvFile(readFileSync(envFile, "utf8")));

function qaSql(sql) {
  const result = spawnSync("docker", dockerPsqlArgs(), {
    input: qaMarkerGuardSql(target.ref) + sql, encoding: "utf8",
    env: { ...process.env, QA_DATABASE_URL: target.databaseUrl },
  });
  if (result.status !== 0) throw new Error(`QA SQL failed: ${(result.stderr || "").replaceAll(target.databaseUrl, "<qa-db>")}`);
  return result.stdout.trim();
}

/** A throwaway Supabase CLI workdir linked to the QA ref (never the repo's own link, which may be Production). */
function linkedQaWorkdir() {
  const dir = mkdtempSync(join(tmpdir(), "cruzial-qa-"));
  mkdirSync(join(dir, "supabase"));
  cpSync(join(root, "supabase/config.toml"), join(dir, "supabase/config.toml"));
  cpSync(join(root, "supabase/migrations"), join(dir, "supabase/migrations"), { recursive: true });
  writeFileSync(join(dir, "supabase/seed.sql"), "select 1;\n");
  const link = spawnSync("npx", ["supabase", "link", "--project-ref", target.ref, "--workdir", dir], { cwd: dir, shell: true, encoding: "utf8" });
  if (link.status !== 0) throw new Error("Could not link the throwaway workdir to the QA project.");
  const linked = readFileSync(join(dir, "supabase/.temp/project-ref"), "utf8").trim();
  if (linked !== target.ref || isProductionRef(linked)) throw new Error("Linked ref mismatch; refusing.");
  return dir;
}

function cliQuery(dir, sql) {
  const file = join(dir, "query.sql");
  writeFileSync(file, sql);
  const result = spawnSync("npx", ["supabase", "db", "query", "--linked", "--workdir", dir, "-f", file, "-o", "json"], { cwd: dir, shell: true, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`QA CLI query failed: ${result.stderr}`);
  return result.stdout;
}

/** Owner-level QA bootstrap (re-run after a reset): marker + qa_runner table grants. */
function bootstrapSql(ref) {
  return `create schema if not exists qa_env;
revoke all on schema qa_env from public, anon, authenticated, service_role;
create table if not exists qa_env.marker (project_ref text primary key, created_at timestamptz not null default now());
revoke all on qa_env.marker from public, anon, authenticated, service_role;
insert into qa_env.marker(project_ref) values ('${ref}') on conflict do nothing;
do $r$ begin if exists (select 1 from pg_roles where rolname = 'qa_runner') then
  grant usage on schema public, private, app, qa_env to qa_runner;
  grant all on all tables in schema public, private, app to qa_runner;
  grant all on all sequences in schema public, private, app to qa_runner;
  grant execute on all functions in schema public, private, app to qa_runner;
  grant select on qa_env.marker to qa_runner;
end if; end $r$;
select project_ref from qa_env.marker;`;
}

const args = process.argv.slice(2);

if (args[0] === "--check") {
  console.log(`QA target ${target.ref}: marker ${qaSql("select project_ref from qa_env.marker;") === target.ref ? "present" : "MISSING"}.`);
  process.exit(0);
}

if (args[0] === "--reset") {
  qaSql("select 1;"); // proves the marker BEFORE anything destructive
  const dir = linkedQaWorkdir();
  try {
    if (!cliQuery(dir, `select project_ref from qa_env.marker where project_ref = '${target.ref}';`).includes(target.ref)) {
      throw new Error("Owner connection does not see the QA marker; refusing to reset.");
    }
    const reset = spawnSync("npx", ["supabase", "db", "reset", "--linked", "--workdir", dir, "--yes"], { cwd: dir, shell: true, stdio: "inherit" });
    if (reset.status !== 0) throw new Error("QA reset failed.");
    if (!cliQuery(dir, bootstrapSql(target.ref)).includes(target.ref)) throw new Error("QA marker was not restored.");
    console.log(`QA ${target.ref} reset to repo migrations; marker and runner grants restored.`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  process.exit(0);
}

const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: target.apiUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: target.publishable, SUPABASE_SECRET_KEY: target.secret,
  CRUZIAL_PRODUCTION_CUTOVER_APPROVED: "false", WHATSAPP_ACCESS_TOKEN: "", WHATSAPP_APP_SECRET: "", WHATSAPP_PARFUMS_PHONE_NUMBER_ID: "", WHATSAPP_IMPORT_PHONE_NUMBER_ID: "",
  ORDER_ABUSE_HMAC_SECRET: randomBytes(32).toString("hex"), SITE_URL: "http://localhost:3200", E2E_LOCAL_PORT: "3200",
  CLOUDINARY_CLOUD_NAME: "e2e-local-cloud", CLOUDINARY_API_KEY: "000000000000000", CLOUDINARY_API_SECRET: "e2e-local-placeholder-not-a-credential" };
delete env.E2E_BASE_URL;
delete env.QA_DATABASE_URL;

if (args[0] === "--build") {
  const result = spawnSync("npm run build", { cwd: web, env, shell: true, stdio: "inherit" });
  process.exit(result.status ?? 1);
}

qaSql("select 1;");
const admin = createClient(target.apiUrl, target.secret, { auth: { persistSession: false } });
mkdirSync(`${web}e2e/.auth`, { recursive: true });
await ensureIdentities({ createClient, apiUrl: target.apiUrl, publishableKey: target.publishable, admin,
  fixtureFile: `${web}e2e/.auth/qa-fixtures-${target.ref}.json`, env, label: "qa" });

if (args.includes("--seed")) {
  args.splice(args.indexOf("--seed"), 1);
  qaSql(readFileSync(`${root}scripts/local-browser-fixtures.sql`, "utf8") + "\n" + readFileSync(`${root}scripts/local-gate-b-browser-fixtures.sql`, "utf8"));
  console.log(`Synthetic browser fixtures loaded into QA ${target.ref}.`);
}

// e2e/local-db.ts reaches the QA database only through this guarded channel.
env.E2E_LOCAL_FIXTURES = "1";
env.E2E_ALLOW_ORDER_SUBMIT = "1";
env.E2E_QA_PROJECT_REF = target.ref;
env.E2E_QA_DATABASE_URL = target.databaseUrl;
const cli = require.resolve("@playwright/test/cli");
const result = spawnSync(process.execPath, [cli, "test", ...args], { cwd: web, env, stdio: "inherit" });
process.exit(result.status ?? 1);
