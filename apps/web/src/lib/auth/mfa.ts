import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Shared MFA (TOTP) helpers.
 *
 * Every message here is deliberately generic: the failure detail (wrong
 * code, expired challenge, unknown factor, backend error) belongs in server
 * logs, never in a string a browser can show or a screenshot can capture.
 * Nothing in this file ever logs a TOTP code, a secret, or a QR URI.
 */

export const GENERIC_MFA_ERROR =
  "No se pudo verificar el código. Intenta de nuevo.";

export type TotpFactor = {
  id: string;
  friendlyName: string | null;
  status: "verified" | "unverified";
};

/**
 * Every TOTP factor belonging to the *current session's* user — verified or
 * not. Scoped implicitly by Supabase Auth to the caller; there is no way to
 * pass another user's id in.
 */
export async function listOwnTotpFactors(
  supabase: SupabaseClient<Database>,
): Promise<{ ok: true; factors: TotpFactor[] } | { ok: false }> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return { ok: false };

  const factors = data.all
    .filter((factor) => factor.factor_type === "totp")
    .map((factor) => ({
      id: factor.id,
      friendlyName: factor.friendly_name ?? null,
      status: factor.status,
    }));

  return { ok: true, factors };
}

/**
 * Validate that a factor id the browser sent back actually belongs to the
 * current user and is in the expected state, before it is used for
 * anything. A form field is input, never proof — the same principle
 * getAdminSession() documents for role/unit claims from the browser.
 */
export function findOwnFactor(
  factors: TotpFactor[],
  factorId: string,
  status: "verified" | "unverified",
): TotpFactor | null {
  return factors.find((factor) => factor.id === factorId && factor.status === status) ?? null;
}
