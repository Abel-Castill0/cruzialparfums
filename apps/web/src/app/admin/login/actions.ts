"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/auth/admin-session";

/**
 * Sign-in for administrators.
 *
 * There is no public signup (docs/client-decisions.md: "V1 tiene admin-only
 * auth y no ofrece signup público"), so this action only ever signs an
 * existing, provisioned user in.
 *
 * Error strings are deliberately coarse. Distinguishing "no such account"
 * from "wrong password" would turn this form into an account-enumeration
 * oracle, and echoing the driver's message could leak internals, so every
 * credential failure returns the same sentence.
 *
 * A correct password no longer redirects straight to /admin: it resolves
 * membership and Authenticator Assurance Level first, exactly like
 * getAdminSession() does for every other admin page, and sends the caller
 * to whichever step is next (MFA challenge, MFA enrollment, or /admin).
 */

export type LoginState = { error: string | null };

export async function signInAdmin(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Ingresa tu correo y contraseña." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      error: "El backend de administración todavía no está configurado en este entorno.",
    };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Categorized, identity-free: invalid credentials vs. auth backend trouble.
    console.warn("[admin-auth] login denied", {
      category: error.status === 400 || error.status === 401 ? "invalid_credentials" : "auth_unavailable",
      status: error.status ?? null,
    });
    return { error: "Credenciales inválidas." };
  }

  const result = await getAdminSession();

  switch (result.status) {
    case "ok":
      redirect("/admin");
    case "mfa_challenge_required":
      redirect("/admin/mfa/challenge");
    case "mfa_enrollment_required":
      redirect("/admin/mfa/enroll");
    case "no_membership":
      // The credentials were valid but this account has no authorized
      // admin/viewer surface. Signing the session back out means a
      // rejected login never leaves an authenticated-but-unauthorized
      // cookie sitting in the browser.
      await supabase.auth.signOut({ scope: "local" });
      return { error: "Credenciales inválidas." };
    default:
      return { error: "No se pudo verificar la sesión. Intenta de nuevo." };
  }
}

export async function signOutAdmin(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  redirect("/admin/login");
}
