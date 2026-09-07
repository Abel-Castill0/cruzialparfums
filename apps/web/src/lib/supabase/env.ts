/**
 * Supabase environment contract.
 *
 * Naming follows the current Supabase key model: a *publishable* key replaces
 * the legacy `anon` key and is safe in the browser (it carries no privilege of
 * its own — RLS decides what it can read), while a *secret* key replaces
 * `service_role`, bypasses RLS entirely, and must never leave the server.
 *
 * That is why only the URL and the publishable key are `NEXT_PUBLIC_*`.
 * `SUPABASE_SECRET_KEY` deliberately has no `NEXT_PUBLIC_` variant: prefixing
 * it would inline the value into the client bundle. A test in
 * `env-contract.test.ts` fails the build if that ever happens.
 *
 * Everything here is read lazily. The Parfums storefront still serves its
 * catalogue from the legacy fixture and must keep building and running with no
 * Supabase environment at all, so a missing variable is a "backend not
 * configured" state to render honestly — never a crash at import time.
 */

export type SupabasePublicEnv = {
  url: string;
  publishableKey: string;
};

/** Public values, safe to read in a browser bundle. */
export function readSupabasePublicEnv(): SupabasePublicEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

/** True when the app has enough configuration to talk to Supabase at all. */
export function isSupabaseConfigured(): boolean {
  return readSupabasePublicEnv() !== null;
}

/**
 * Server-only secret key. Returns null when unset so callers must handle the
 * unconfigured case explicitly instead of sending `undefined` as a credential.
 *
 * Reaching for this should be rare: prefer the caller's own session plus RLS,
 * which is auditable per user. The secret key bypasses RLS completely, so a
 * bug in code that uses it is a cross-tenant data leak rather than a denied
 * query.
 */
export function readSupabaseSecretKey(): string | null {
  if (typeof window !== "undefined") {
    throw new Error("readSupabaseSecretKey() must never run in the browser.");
  }
  return process.env.SUPABASE_SECRET_KEY?.trim() || null;
}

/**
 * Email allowed to bootstrap the first administrator, from configuration
 * rather than source. docs/client-decisions.md records
 * `ADMIN_BOOTSTRAP_EMAIL` as provisioning data — it is not the public contact
 * address and must not be hardcoded into a shipped page.
 */
export function readAdminBootstrapEmail(): string | null {
  if (typeof window !== "undefined") {
    throw new Error("readAdminBootstrapEmail() must never run in the browser.");
  }
  return process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase() || null;
}
