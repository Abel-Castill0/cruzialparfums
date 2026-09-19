"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readSiteUrl } from "@/lib/supabase/env";
import { resolveCanonicalUrl } from "@/lib/seo/canonical-url";

/**
 * Password recovery request.
 *
 * The outward response is always the same sentence, regardless of whether
 * the account exists, whether Supabase is configured, or whether the
 * underlying call errors. Supabase's own resetPasswordForEmail() already
 * avoids revealing account existence; this preserves that property across
 * this application's own error paths too, so a difference in this action's
 * behavior never becomes a new account-enumeration oracle.
 */

export type ForgotPasswordState = { message: string };

const GENERIC_MESSAGE =
  "Si existe una cuenta autorizada asociada a ese correo, recibirás instrucciones para continuar.";

/**
 * Build the recovery redirect from trusted server configuration only —
 * never from a request's Host/Origin header, which is attacker-controlled
 * input and the classic host-header-poisoning path into a password-reset
 * link.
 */
function buildRecoveryRedirect(): string | null {
  const siteUrl = readSiteUrl();
  if (!siteUrl) return null;

  const callback = resolveCanonicalUrl("/auth/callback", siteUrl);
  if (!callback) return null;

  const url = new URL(callback);
  url.searchParams.set("next", "/admin/reset-password");
  return url.toString();
}

export async function requestPasswordReset(
  _previous: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { message: GENERIC_MESSAGE };

  // Must be the cookie-bound client, not the stateless public one. This
  // call is the start of a PKCE exchange: it derives a code_verifier that
  // /auth/callback has to present later when it redeems the `code`. The
  // stateless client defaults to the implicit flow, which returns the
  // tokens in the URL *fragment* — never sent to a server — so the
  // callback would see no `code` at all and the whole recovery flow would
  // dead-end at /admin/login?error=missing_code.
  const supabase = await createSupabaseServerClient();
  const redirectTo = buildRecoveryRedirect();

  if (supabase && redirectTo) {
    await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  }

  return { message: GENERIC_MESSAGE };
}
