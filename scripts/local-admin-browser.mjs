/** Local-only browser runner. Uses real Auth password + TOTP, never bypasses MFA.
 * Usage: node scripts/local-admin-browser.mjs [playwright arguments]
 * Requires the local Supabase stack and a web build made with its public URL.
 * No hosted URL or service key is accepted from the environment.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { ensureIdentities } from "./lib/e2e-identities.mjs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const web = fileURLToPath(new URL("../apps/web/", import.meta.url));
const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");
const status = spawnSync("npx supabase status -o json", { cwd: root, shell: true, encoding: "utf8" });
if (status.status !== 0) throw new Error("Local Supabase is not available.");
const config = JSON.parse(status.stdout);
const url = new URL(config.API_URL);
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.protocol !== "http:") throw new Error("Only loopback Supabase is allowed.");
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: url.origin,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.ANON_KEY, SUPABASE_SECRET_KEY: config.SERVICE_ROLE_KEY,
  CRUZIAL_PRODUCTION_CUTOVER_APPROVED: "false", WHATSAPP_ACCESS_TOKEN: "", WHATSAPP_APP_SECRET: "", WHATSAPP_PARFUMS_PHONE_NUMBER_ID: "", WHATSAPP_IMPORT_PHONE_NUMBER_ID: "",
  ORDER_ABUSE_HMAC_SECRET: randomBytes(32).toString("hex"), SITE_URL: "http://localhost:3100", E2E_LOCAL_PORT: "3100" };
delete env.E2E_BASE_URL;
// Non-credential placeholders for the loopback-only server: the multi-photo upload specs intercept every
// Cloudinary request in the browser, so the server only needs a *configured-looking* env to sign an
// authorization. Overwritten unconditionally so a developer's real Cloudinary credentials can never be
// used (or even read) by this disposable stack.
env.CLOUDINARY_CLOUD_NAME = "e2e-local-cloud";
env.CLOUDINARY_API_KEY = "000000000000000";
env.CLOUDINARY_API_SECRET = "e2e-local-placeholder-not-a-credential";
const admin = createClient(url.origin, config.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
mkdirSync(`${web}e2e/.auth`, { recursive: true });
await ensureIdentities({ createClient, apiUrl: url.origin, publishableKey: config.ANON_KEY, admin,
  fixtureFile: `${web}e2e/.auth/local-fixtures.json`, env, label: "local" });
const args = process.argv.slice(2);
if (args.includes("--seed")) {
  args.splice(args.indexOf("--seed"),1);
  const project=readFileSync(`${root}supabase/config.toml`,"utf8").match(/^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m)?.[1];
  if(!project) throw new Error("Invalid local project id.");
  const seeded=spawnSync("docker",["exec","-i",`supabase_db_${project}`,"psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1"],{
    input:readFileSync(`${root}scripts/local-browser-fixtures.sql`,"utf8")+"\n"+readFileSync(`${root}scripts/local-gate-b-browser-fixtures.sql`,"utf8"),encoding:"utf8"});
  if(seeded.status!==0) throw new Error(`Local fixtures failed: ${seeded.stderr}`);
  console.log("Synthetic local Import browser fixtures ready.");
}
env.E2E_LOCAL_FIXTURES="1";
env.E2E_ALLOW_ORDER_SUBMIT="1";
if (args[0] === "--gate") {
 const audit=spawnSync("npm audit --omit=dev --audit-level=high",{cwd:web,env,shell:true,stdio:"inherit"});
 if(audit.status!==0)process.exit(audit.status??1);
 const gate=spawnSync("npm run check",{cwd:web,env,shell:true,stdio:"inherit"});
 process.exit(gate.status??1);
}
if (args[0] === "--build") {
  const result=spawnSync("npm run build",{cwd:web,env,shell:true,stdio:"inherit"});
  process.exit(result.status ?? 1);
}
// No shell interpolation of arguments supplied by the caller.
const cli = require.resolve("@playwright/test/cli");
const result=spawnSync(process.execPath,[cli,"test",...args],{cwd:web,env,stdio:"inherit"});
process.exit(result.status ?? 1);
