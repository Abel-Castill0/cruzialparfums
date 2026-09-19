"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRecoverySession } from "@/lib/auth/recovery-session";

export type ResetPasswordState = { error: string | null };

const MIN_PASSWORD_LENGTH = 12;

/**
 * Complete a password reset from a recovery session.
 *
 * This Server Action — not the page — is the security boundary: the page
 * only decides what to render, while this is what actually changes a
 * credential, and it is reachable by POST regardless of what the page did.
 *
 * It requires proof that the session came from a recovery link
 * (`amr` contains `recovery`, see getRecoverySession). A normal signed-in
 * session — including a valid aal1 admin session created by an ordinary
 * password login — is explicitly rejected here, because otherwise anyone
 * holding a stolen password could change the account password without ever
 * passing MFA.
 *
 * On success the session is deliberately revoked (signOut scope "global"):
 * the local auth cookies are cleared and every refresh token for the
 * account is invalidated, so the user must sign in again and go through the
 * normal MFA challenge/enrollment path. Access tokens already issued remain
 * valid until they expire — Supabase does not revoke those synchronously,
 * and this code does not pretend otherwise.
 */
export async function updateAdminPassword(
  _previous: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }
  if (password !== confirmPassword) {
    return { error: "Las contraseñas no coinciden." };
  }

  const recovery = await getRecoverySession();
  if (recovery.status !== "ready") {
    // Deliberately one message for every rejected case (no session, a
    // normal non-recovery session, a backend error): the caller learns
    // only that this request will not change a password here.
    return { error: "El enlace de recuperación ya no es válido. Solicita uno nuevo." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      error: "El backend de administración todavía no está configurado en este entorno.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: "No se pudo actualizar la contraseña. Intenta de nuevo." };
  }

  await supabase.auth.signOut({ scope: "global" });

  redirect("/admin/login");
}
