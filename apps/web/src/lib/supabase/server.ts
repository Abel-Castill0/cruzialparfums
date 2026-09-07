import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { readSupabasePublicEnv, readSupabaseSecretKey } from "./env";

/**
 * Supabase clients for the server.
 *
 * A fresh client per request, never a module-level singleton: a shared client
 * would leak one visitor's session into another's render.
 */

/**
 * Request-scoped client that acts *as the signed-in user*, so every query is
 * still subject to RLS. This is the client almost all server code should use.
 *
 * Returns null when Supabase is not configured, so callers render an honest
 * "backend not configured" state instead of failing with a credential error.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient<Database> | null> {
  const env = readSupabasePublicEnv();
  if (!env) return null;

  const cookieStore = await cookies();

  return createServerClient<Database>(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. That is expected: the
          // proxy (src/proxy.ts) refreshes the session and writes the
          // rotated cookies on the response, so swallowing this here is safe
          // only because that refresh exists.
        }
      },
    },
  });
}

/**
 * Client that uses the secret key and therefore **bypasses RLS entirely**.
 *
 * Only for operations that genuinely cannot be expressed as the acting user —
 * provisioning the first admin membership, for instance, which by design has
 * no INSERT policy. Every call site must do its own authorization first,
 * because the database will not do it for you here.
 *
 * Returns null when the secret key is unset.
 */
export function createSupabaseAdminClient(): SupabaseClient<Database> | null {
  const env = readSupabasePublicEnv();
  const secretKey = readSupabaseSecretKey();
  if (!env || !secretKey) return null;

  return createServerClient<Database>(env.url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    cookies: {
      // No session is carried: this client is not "a user", it is the server.
      getAll() {
        return [];
      },
    },
  });
}
