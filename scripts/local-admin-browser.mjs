/** Local-only browser runner. Uses real Auth password + TOTP, never bypasses MFA.
 * Usage: node scripts/local-admin-browser.mjs [playwright arguments]
 * Requires the local Supabase stack and a web build made with its public URL.
 * No hosted URL or service key is accepted from the environment.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { randomBytes, createHmac } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
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
  ORDER_ABUSE_HMAC_SECRET: randomBytes(32).toString("hex"), SITE_URL: "http://localhost:3100", E2E_LOCAL_PORT: "3100" };
delete env.E2E_BASE_URL;
const admin = createClient(url.origin, config.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
function assertResult(result, label) { if (result.error) throw new Error(`${label} failed (${result.error.code ?? result.error.status ?? "unknown"}).`); return result.data; }
function totp(secret) {
  const bits = [...secret.replace(/=+$/, "")].map(c => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c).toString(2).padStart(5,"0")).join("");
  const bytes = Buffer.from((bits.match(/.{8}/g) ?? []).map(b=>parseInt(b,2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest = createHmac("sha1",bytes).update(counter).digest();
  return String((digest.readUInt32BE(digest[19]&15)&0x7fffffff)%1000000).padStart(6,"0");
}
mkdirSync(`${web}e2e/.auth`, { recursive: true });
const fixtureFile = `${web}e2e/.auth/local-fixtures.json`;
const saved = existsSync(fixtureFile) ? JSON.parse(readFileSync(fixtureFile,"utf8")) : {};
const units = assertResult(await admin.from("business_units").select("id,code"), "Read units");
for (const [prefix, codes] of [["E2E_ADMIN",["parfums","import"]],["E2E_PARFUMS_ADMIN",["parfums"]]]) {
  let identity = saved[prefix];
  if (identity && (await admin.auth.admin.getUserById(identity.id)).error) identity = null;
  if (!identity) {
    const email = `local-${randomBytes(8).toString("hex")}@example.test`;
    const password = `${randomBytes(24).toString("base64url")}aA1!`;
    const user = assertResult(await admin.auth.admin.createUser({email,password,email_confirm:true}), "Create local user").user;
    assertResult(await admin.from("admin_memberships").insert(units.filter(u=>codes.includes(u.code)).map(u=>({user_id:user.id,business_unit_id:u.id,role:"admin",is_active:true}))), "Grant local membership");
    const client = createClient(url.origin, config.ANON_KEY, {auth:{persistSession:false}});
    assertResult(await client.auth.signInWithPassword({email,password}), "Local sign-in");
    const factor = assertResult(await client.auth.mfa.enroll({factorType:"totp",friendlyName:"Local browser verification"}), "Enroll local TOTP");
    assertResult(await client.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(factor.totp.secret)}), "Verify local TOTP");
    identity = {id:user.id,email,password,secret:factor.totp.secret};
    saved[prefix] = identity;
    writeFileSync(fixtureFile, JSON.stringify(saved), {mode:0o600});
  }
  env[`${prefix}_EMAIL`]=identity.email;
  env[`${prefix}_PASSWORD`]=identity.password;
  env[`${prefix}_TOTP_SECRET`]=identity.secret;
}
const args = process.argv.slice(2);
if (args.includes("--seed")) {
  args.splice(args.indexOf("--seed"),1);
  const project=readFileSync(`${root}supabase/config.toml`,"utf8").match(/^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m)?.[1];
  if(!project) throw new Error("Invalid local project id.");
  const seeded=spawnSync("docker",["exec","-i",`supabase_db_${project}`,"psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1"],{
    input:readFileSync(`${root}scripts/local-browser-fixtures.sql`,"utf8"),encoding:"utf8"});
  if(seeded.status!==0) throw new Error(`Local fixtures failed: ${seeded.stderr}`);
  console.log("Synthetic local Import browser fixtures ready.");
}
env.E2E_LOCAL_FIXTURES="1";
env.E2E_ALLOW_ORDER_SUBMIT="1";
if (args[0] === "--build") {
  const result=spawnSync("npm run build",{cwd:web,env,shell:true,stdio:"inherit"});
  process.exit(result.status ?? 1);
}
// No shell interpolation of arguments supplied by the caller.
const cli = require.resolve("@playwright/test/cli");
const result=spawnSync(process.execPath,[cli,"test",...args],{cwd:web,env,stdio:"inherit"});
process.exit(result.status ?? 1);
