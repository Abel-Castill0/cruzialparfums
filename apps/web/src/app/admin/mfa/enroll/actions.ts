"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminPreMfaSession, getAdminSession } from "@/lib/auth/admin-session";
import { findOwnFactor, listOwnTotpFactors, GENERIC_MFA_ERROR } from "@/lib/auth/mfa";

export type EnrollVerifyState = { error: string | null };

/**
 * Verify the code for a just-created, unverified TOTP factor and promote
 * the session to aal2.
 *
 * The factorId comes from a hidden form field, so it is browser input, not
 * proof — it is re-validated here against this user's own unverified TOTP
 * factors before it is used for anything. A verify call with someone else's
 * factor id, or with a verified/nonexistent factor id, is rejected before
 * challengeAndVerify() is ever reached.
 */
export async function verifyEnrollment(
  _previous: EnrollVerifyState,
  formData: FormData,
): Promise<EnrollVerifyState> {
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
  const factor = owned.ok ? findOwnFactor(owned.factors, factorId, "unverified") : null;
  if (!factor) return { error: GENERIC_MFA_ERROR };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: GENERIC_MFA_ERROR };

  const result = await getAdminSession();
  if (result.status !== "ok") return { error: GENERIC_MFA_ERROR };

  redirect("/admin");
}
