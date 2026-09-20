/** Prepare the exact committed C2 artifact for local pgTAP only.
 * Run before `npx supabase test db`, including after a local reset.
 * Only a separate local test-support schema is populated. No hosted path exists.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(resolve(root, "supabase/staging/commercial-reconciliation.json"));
const sha = createHash("sha256").update(raw).digest("hex");
if (sha !== "90c6bd433b054b375a657c635e58587f9f5fe61d3b125075a9dca7a1c5ba79ee") {
  throw new Error("C2 fixture artifact changed; refuse test preparation.");
}
const config = readFileSync(resolve(root, "supabase/config.toml"), "utf8");
const project = config.match(/^project_id\s*=\s*"([a-zA-Z0-9_-]+)"\s*$/mu)?.[1];
if (!project) throw new Error("No safe local Supabase project_id.");
const result = spawnSync("docker", [
  "exec", "-i", `supabase_db_${project}`, "psql", "-U", "postgres", "-d", "postgres",
  "-X", "-q", "-v", "ON_ERROR_STOP=1",
], { input: `begin;
create schema if not exists c3b1_test_support;
revoke all on schema c3b1_test_support from public,anon,authenticated,service_role;
create table if not exists c3b1_test_support.manifest(id boolean primary key check(id), payload jsonb not null);
revoke all on table c3b1_test_support.manifest from public,anon,authenticated,service_role;
insert into c3b1_test_support.manifest values(true,$c3b1_${sha}$${raw.toString("utf8")}$c3b1_${sha}$::jsonb)
on conflict(id) do update set payload=excluded.payload;
commit;`, encoding: "utf8", cwd: root });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(result.stderr || "Local fixture preparation failed.");
console.log(`Local pgTAP C2 fixture prepared: SHA-256 ${sha}`);
