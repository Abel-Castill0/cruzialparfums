import { NextResponse, type NextRequest } from "next/server";
import { safeAdminRedirectPath } from "@/lib/auth/admin-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * OAuth / email-link callback.
 *
 * Password sign-in (the only method enabled in V1) does not pass through here,
 * but Supabase redirects to this path for recovery and email-confirmation
 * links, and config.toml allow-lists exactly this URL.
 *
 * The `next` parameter is validated as a *relative admin path* before being
 * used. Reflecting an arbitrary `next` back into a redirect is the classic
 * open-redirect hole — an attacker sends a link that authenticates the victim
 * and then bounces them to an external page.
 */

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeAdminRedirectPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/admin/login?error=missing_code", origin));
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(new URL("/admin/login?error=not_configured", origin));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // Generic reason on purpose: the failure detail belongs in server logs,
    // not in a URL the user can screenshot or share.
    return NextResponse.redirect(new URL("/admin/login?error=invalid_link", origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
