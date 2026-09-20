"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/auth/admin-session";
import { findOwnFactor, listOwnTotpFactors, GENERIC_MFA_ERROR } from "@/lib/auth/mfa";

/**
 * All three actions below require getAdminSession() to return "ok", which
 * — since 20260919205854_admin_mfa_aal2_enforcement.sql and the matching
 * change in getAdminSession() — already implies aal2. There is no separate
 * "am I at aal2" check to remember here: it is baked into what "ok" means.
 */

export type AddFactorState =
  | { status: "idle" }
  | { status: "pending"; factorId: string; qrCode: string; secret: string }
  | { status: "error"; error: string };

// useActionState requires this exact (previousState, formData) signature;
// neither argument is needed to start an enrollment.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function beginAddFactor(_previous: AddFactorState, _formData: FormData): Promise<AddFactorState> {
  const session = await getAdminSession();
  if (session.status !== "ok") return { status: "error", error: GENERIC_MFA_ERROR };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", error: GENERIC_MFA_ERROR };

  // V1: application code never unenrolls factors (no self-service factor
  // removal — not even stale unverified ones). An abandoned unverified
  // factor blocks nothing: it cannot satisfy AAL2, is never listed in the
  // challenge UI, and can only be removed operator-side via Supabase.
  // A friendly_name is required: GoTrue defaults it to "" when omitted, and
  // rejects a second factor for the same user with mfa_factor_name_conflict
  // once one factor already holds that default name.
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `totp-${crypto.randomUUID()}`,
  });
  if (error || !data || data.type !== "totp") {
    return { status: "error", error: GENERIC_MFA_ERROR };
  }

  return {
    status: "pending",
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

export type VerifyAddFactorState = { error: string | null; success: boolean };

export async function verifyAddFactor(
  _previous: VerifyAddFactorState,
  formData: FormData,
): Promise<VerifyAddFactorState> {
  const factorId = String(formData.get("factorId") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();

  if (!factorId || !/^\d{6}$/.test(code)) {
    return { error: GENERIC_MFA_ERROR, success: false };
  }

  const session = await getAdminSession();
  if (session.status !== "ok") return { error: GENERIC_MFA_ERROR, success: false };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: GENERIC_MFA_ERROR, success: false };

  const owned = await listOwnTotpFactors(supabase);
  const factor = owned.ok ? findOwnFactor(owned.factors, factorId, "unverified") : null;
  if (!factor) return { error: GENERIC_MFA_ERROR, success: false };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: GENERIC_MFA_ERROR, success: false };

  revalidatePath("/admin/security");
  return { error: null, success: true };
}

// V1 has NO self-service factor removal. There is deliberately no
// factor-removal Server Action and no mfa.unenroll() call anywhere in this
// codebase: an admin cannot delete a factor from the Cruzial UI at all.
// Factor recovery/removal is operator-only via Supabase (dashboard /
// Management API) — see the Gate 2C1 operator recovery runbook. This also
// eliminates the read-then-write "last factor" race that any application
// lock could only partially close.
