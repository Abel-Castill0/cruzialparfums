import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Start (or restart) a TOTP enrollment for the current session's user.
 *
 * Not a Server Action: this is called directly from the /admin/mfa/enroll
 * Server Component render, because the QR code and secret are only ever
 * returned once, at the moment `mfa.enroll()` creates the factor — there is
 * no API to fetch them again for an existing unverified factor.
 *
 * V1 policy: application code NEVER calls `mfa.unenroll()` — not for
 * removal (operator-only via Supabase) and not for cleanup. A stale
 * unverified factor left by an abandoned attempt is inert: it cannot
 * satisfy AAL2, is never listed by the challenge UI (verified only), and
 * is ignored by the operator recovery runbook; `enroll()` simply returns a
 * fresh factor on retry.
 *
 * The secret and QR code returned here are held only in this request/render
 * and handed to the client for display — never persisted, never logged.
 */
export async function startTotpEnrollment(
  supabase: SupabaseClient<Database>,
): Promise<{ factorId: string; qrCode: string; secret: string } | null> {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (error || !data || data.type !== "totp") return null;

  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}
