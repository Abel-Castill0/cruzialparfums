"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
    return { error: "Credenciales inválidas." };
  }

  redirect("/admin");
}

export async function signOutAdmin(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  redirect("/admin/login");
}
