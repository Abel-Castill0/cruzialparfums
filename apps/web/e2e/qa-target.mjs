/** Hosted QA target contract (pure, unit-tested in scripts/qa-target.test.mjs).
 *
 * The hosted QA project is a second, disposable Supabase project that holds only synthetic data.
 * Everything that writes to it (fixtures, E2E side-effect SQL, resets) must first prove it is NOT
 * Production, twice:
 *   1. statically: the configured ref is not a known Production ref and every URL/credential in the
 *      env file belongs to that same ref;
 *   2. at runtime: the database itself carries the row `qa_env.marker(project_ref = <ref>)`. That row
 *      is created by hand when the QA project is provisioned and is never part of a migration, so it
 *      cannot exist in Production.
 */

/** Supabase project refs that are Production. The name `cruzial-v2-staging` is historical: it IS Production. */
export const PRODUCTION_PROJECT_REFS = Object.freeze(["iyxidhglyqkzoziyewlc"]);

const REF_PATTERN = /^[a-z]{20}$/;

/** Minimal KEY=VALUE parser for the local, git-ignored QA env file (no interpolation, no export). */
export function parseEnvFile(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match) out[match[1]] = match[2].trim();
  }
  return out;
}

export function isProductionRef(ref) {
  return PRODUCTION_PROJECT_REFS.includes(String(ref ?? "").trim());
}

/** Validates the QA env file contents. Throws with a message that never includes a secret value. */
export function validateQaTarget(env) {
  const ref = String(env.QA_PROJECT_REF ?? "").trim();
  if (!REF_PATTERN.test(ref)) throw new Error("QA_PROJECT_REF is missing or malformed.");
  if (isProductionRef(ref)) throw new Error("QA_PROJECT_REF is a Production project; refusing.");

  const apiUrl = String(env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (apiUrl !== `https://${ref}.supabase.co`) throw new Error("NEXT_PUBLIC_SUPABASE_URL does not belong to QA_PROJECT_REF.");

  const publishable = String(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  const secret = String(env.SUPABASE_SECRET_KEY ?? "").trim();
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishable)) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing or not a publishable key.");
  // `supabase projects api-keys` masks secret keys with "·" unless --reveal is passed; a masked key is rejected here.
  if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(secret)) throw new Error("SUPABASE_SECRET_KEY is missing, masked or not a secret key.");

  let db;
  try {
    db = new URL(String(env.QA_DATABASE_URL ?? ""));
  } catch {
    throw new Error("QA_DATABASE_URL is missing or malformed.");
  }
  if (!["postgres:", "postgresql:"].includes(db.protocol)) throw new Error("QA_DATABASE_URL must be a postgres URL.");
  const user = decodeURIComponent(db.username);
  const host = db.hostname;
  const pooled = host.endsWith(".pooler.supabase.com") && user.endsWith(`.${ref}`);
  const direct = host === `db.${ref}.supabase.co`;
  if (!pooled && !direct) throw new Error("QA_DATABASE_URL does not belong to QA_PROJECT_REF.");
  for (const productionRef of PRODUCTION_PROJECT_REFS) {
    if (db.href.includes(productionRef)) throw new Error("QA_DATABASE_URL references a Production project; refusing.");
  }

  return { ref, apiUrl, publishable, secret, databaseUrl: db.href };
}

/** psql prelude that aborts unless the connected database carries this ref's QA marker. QUIET keeps the
 * guard's own command tag out of stdout, so callers parse exactly what they would parse locally. */
export function qaMarkerGuardSql(ref) {
  if (!REF_PATTERN.test(ref) || isProductionRef(ref)) throw new Error("Invalid QA ref for the marker guard.");
  return `\\set QUIET on
do $qa_guard$ begin
  if to_regclass('qa_env.marker') is null then
    raise exception 'QA marker table not found: this is not the QA database';
  end if;
  -- Separate statement: PL/pgSQL plans it only once the table is known to exist.
  if not exists (select 1 from qa_env.marker where project_ref = '${ref}') then
    raise exception 'QA marker for ${ref} not found: this is not the QA database';
  end if;
end $qa_guard$;
\\set QUIET off
`;
}

/** docker arguments for a throwaway psql client; the URL travels in the environment, never in argv. */
export function dockerPsqlArgs() {
  return ["run", "--rm", "-i", "-e", "QA_DATABASE_URL", "postgres:17-alpine",
    "sh", "-c", 'exec psql "$QA_DATABASE_URL" -X -At -v ON_ERROR_STOP=1'];
}
