import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Proof that the current session came from an account-recovery link.
 *
 * This is the security boundary for /admin/reset-password. "There is a
 * signed-in user" is NOT that proof: a normal password login produces
 * exactly that state, so gating on `getUser()` alone would let anyone
 * holding a stolen password change the account password without ever
 * completing MFA — the precise attack mandatory MFA exists to stop.
 *
 * What distinguishes the two is the `amr` (Authentication Methods
 * Reference) claim in the access token. Verified empirically against this
 * project's Supabase Auth on the PKCE flow the app uses:
 *
 *   normal password login -> amr: [{ method: "password", ... }]
 *   recovery link          -> amr: [{ method: "recovery", ... }]
 *
 * The claim is read with `getClaims()`, which verifies the JWT signature
 * (locally via WebCrypto for asymmetric signing keys, or against the auth
 * server for symmetric ones) — never an unverified client-side decode, and
 * never a query parameter, hidden field, or pathname, all of which are
 * caller-controlled.
 *
 * `getUser()` is called as well, because `getClaims()` can be satisfied by
 * a signature-valid token that the auth server has already revoked. Both
 * must succeed and must agree on the subject.
 *
 * Every failure mode returns a non-"ready" status: this fails closed.
 */

export type RecoverySessionResult =
  | { status: "not_configured" }
  | { status: "unavailable" }
  | { status: "no_session" }
  | { status: "not_recovery" }
  | { status: "ready"; userId: string };

/** `amr` is documented as either AMREntry[] or a plain string[]. */
function amrIncludesRecovery(amr: unknown): boolean {
  if (!Array.isArray(amr)) return false;

  return amr.some((entry) => {
    if (typeof entry === "string") return entry === "recovery";
    if (entry && typeof entry === "object" && "method" in entry) {
      return (entry as { method?: unknown }).method === "recovery";
    }
    return false;
  });
}

export async function getRecoverySession(): Promise<RecoverySessionResult> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "not_configured" };

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user) {
    const missingSession =
      !userError ||
      userError.status === 401 ||
      userError.name === "AuthSessionMissingError";
    return { status: missingSession ? "no_session" : "unavailable" };
  }

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return { status: "unavailable" };

  // A token whose subject disagrees with the auth server's answer is not a
  // session this app will act on.
  if (data.claims.sub !== user.id) return { status: "unavailable" };

  if (!amrIncludesRecovery(data.claims.amr)) return { status: "not_recovery" };

  return { status: "ready", userId: user.id };
}
