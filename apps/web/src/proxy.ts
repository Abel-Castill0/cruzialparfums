import { NextRequest, NextResponse } from "next/server";
import { LegacyCatalogRepository } from "./domains/catalog/legacy-catalog-repository";
import { resolveLegacyRoute } from "./domains/routing/legacy-route-resolver";
import { refreshSupabaseSession } from "./lib/supabase/proxy-session";

const products = new LegacyCatalogRepository();

export async function proxy(request: NextRequest) {
  const legacyLocation = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const resolution = resolveLegacyRoute(legacyLocation, products);

  if (resolution) {
    return NextResponse.redirect(
      new URL(resolution.destination, request.url),
      resolution.statusCode,
    );
  }

  // Refresh the Supabase session so rotated auth cookies are written on the
  // response. This is *not* an authorization gate: /admin pages authorize
  // themselves server-side via getAdminSession(). A proxy check alone would
  // be bypassable and would tempt pages into trusting it.
  return refreshSupabaseSession(request, NextResponse.next());
}

export const config = {
  matcher: [
    // Legacy static-site URLs that have a real V2 destination.
    "/index.html",
    "/catalog.html",
    "/combos.html",
    "/checkout.html",
    "/mayorista.html",
    "/nosotros.html",
    "/contacto.html",
    "/privacidad.html",
    "/terminos.html",
    "/product.html",
    // Authenticated surfaces, so the session is refreshed while an admin works.
    "/admin/:path*",
    "/auth/:path*",
  ],
};
