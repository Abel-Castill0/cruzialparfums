"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readSupabasePublicEnv } from "./env";

/**
 * Browser client, built only from the publishable key.
 *
 * Anything this client can reach, an anonymous visitor can reach — the key
 * carries no privilege of its own and RLS is what decides. Never treat a
 * value read through this client as authorization, and never do a permission
 * check here: the server re-checks every mutation.
 */
export function createSupabaseBrowserClient(): SupabaseClient | null {
  const env = readSupabasePublicEnv();
  if (!env) return null;

  return createBrowserClient(env.url, env.publishableKey);
}
