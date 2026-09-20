import { NextRequest, NextResponse } from "next/server";
import { LegacyCatalogRepository } from "./domains/catalog/legacy-catalog-repository";
import { resolveLegacyRoute } from "./domains/routing/legacy-route-resolver";
import { buildContentSecurityPolicy, createCspNonce } from "./lib/security/content-security-policy";
import { refreshSupabaseSession } from "./lib/supabase/proxy-session";

// Legacy-id -> slug map for historical URLs only. The fixture is a static
// reference here, never a catalog authority (see lib/catalog/parfums-storefront).
const legacyProducts = new LegacyCatalogRepository();

function isAuthenticatedSurface(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/auth/");
}

export async function proxy(request: NextRequest) {
  const legacyLocation = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const resolution = resolveLegacyRoute(legacyLocation, legacyProducts);

  if (resolution) {
    return NextResponse.redirect(
      new URL(resolution.destination, request.url),
      resolution.statusCode,
    );
  }

  // Per-request nonce: Next picks it up from the request's CSP header and
  // stamps it on every inline script it emits, so `script-src` can stay
  // strict (no 'unsafe-inline'). Requires dynamic rendering, which every
  // HTML route in this app already is.
  const nonce = createCspNonce();
  const csp = buildContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);

  if (!isAuthenticatedSurface(request.nextUrl.pathname)) return response;

  // Refresh the Supabase session so rotated auth cookies are written on the
  // response. This is *not* an authorization gate: /admin pages authorize
  // themselves server-side via getAdminSession(). A proxy check alone would
  // be bypassable and would tempt pages into trusting it.
  return refreshSupabaseSession(request, response);
}

export const config = {
  matcher: [
    // Legacy static-site URLs that have a real V2 destination. Listed
    // explicitly because the generic pattern below skips paths with a dot.
    "/index.html",
    "/catalog.html",
    "/combos.html",
    "/checkout.html",
    "/mayorista.html",
    "/perfumes-enteros.html",
    "/nosotros.html",
    "/contacto.html",
    "/privacidad.html",
    "/terminos.html",
    "/product.html",
    // Every HTML route gets the CSP; static assets, images and files with an
    // extension are skipped, as are Next's own prefetch requests.
    {
      source: "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
