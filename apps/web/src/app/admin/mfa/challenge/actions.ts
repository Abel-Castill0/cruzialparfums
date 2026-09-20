"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminPreMfaSession, getAdminSession } from "@/lib/auth/admin-session";
import { findOwnFactor, listOwnTotpFactors, GENERIC_MFA_ERROR } from "@/lib/auth/mfa";

export type ChallengeState = { error: string | null };

/**
 * Verify a TOTP code for an existing *verified* factor to promote the
 * session to aal2.
 *
 * factorId is a browser-supplied form field. It is re-validated against
 * this user's own verified TOTP factors before being used: accepting an
 * arbitrary factorId from the client would let a caller aim
 * challengeAndVerify() at a factor that is not theirs (Supabase's own check
 * would likely reject the mismatch, but this app does not rely on that —
 * see the Gate 2C1 instructions on not trusting client-supplied factorId).
 */
export async function verifyChallenge(
  _previous: ChallengeState,
  formData: FormData,
): Promise<ChallengeState> {
  const factorId = String(formData.get("factorId") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();

  if (!factorId || !/^\d{6}$/.test(code)) {
    return { error: GENERIC_MFA_ERROR };
  }

  const pre = await getAdminPreMfaSession();
  if (pre.status !== "ready" || pre.session.currentLevel === "aal2") {
    return { error: GENERIC_MFA_ERROR };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: GENERIC_MFA_ERROR };

  const owned = await listOwnTotpFactors(supabase);
  const factor = owned.ok ? findOwnFactor(owned.factors, factorId, "verified") : null;
  if (!factor) return { error: GENERIC_MFA_ERROR };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: GENERIC_MFA_ERROR };

  const result = await getAdminSession();
  if (result.status !== "ok") return { error: GENERIC_MFA_ERROR };

  redirect("/admin");
}
