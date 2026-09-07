import { NextRequest, NextResponse } from "next/server";
import { LegacyCatalogRepository } from "./domains/catalog/legacy-catalog-repository";
import { resolveLegacyRoute } from "./domains/routing/legacy-route-resolver";

const products = new LegacyCatalogRepository();

export function proxy(request: NextRequest) {
  const legacyLocation = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const resolution = resolveLegacyRoute(legacyLocation, products);

  if (!resolution) return NextResponse.next();

  return NextResponse.redirect(
    new URL(resolution.destination, request.url),
    resolution.statusCode,
  );
}

export const config = {
  matcher: [
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
  ],
};
