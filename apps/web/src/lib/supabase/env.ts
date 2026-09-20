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
 * Everything here is read lazily. Without a Supabase environment the app
 * must still build and run (unit tests, cold local checkouts), so a missing
 * variable is a "backend not configured" state to render honestly — never a
 * crash at import time. Every deployed environment is expected to set it:
 * the Parfums and Import storefronts read their catalogs from Supabase.
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

/**
 * Server-only HMAC key dedicated to pseudonymizing order-request anti-abuse
 * identity (src/lib/security/order-abuse.ts). Never reuse this for anything
 * else, and never read it eagerly at module scope: `next build` must keep
 * succeeding with this unset, so a missing secret is only ever a runtime
 * "fail closed" decision at the point a real checkout needs it.
 */
export function readOrderAbuseHmacSecret(): string | null {
  if (typeof window !== "undefined") {
    throw new Error("readOrderAbuseHmacSecret() must never run in the browser.");
  }
  return process.env.ORDER_ABUSE_HMAC_SECRET?.trim() || null;
}

/**
 * Trusted origin used to build the one security-sensitive redirect this app
 * constructs outside of a request: the `resetPasswordForEmail` recovery
 * link. Deliberately its own explicit configuration value, never derived
 * from an inbound `Host`/`Origin` header — a request header is attacker
 * input, and building an auth redirect from it is the textbook host-header
 * poisoning path into a password-reset link. Server-only: this never needs
 * to reach the browser bundle.
 */
export function readSiteUrl(): string | null {
  if (typeof window !== "undefined") {
    throw new Error("readSiteUrl() must never run in the browser.");
  }
  return process.env.SITE_URL?.trim() || null;
}
