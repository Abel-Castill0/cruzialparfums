export type LegacyProductLookup = {
  findByLegacyId(legacyId: string): { slug: string } | null;
};

export type LegacyRouteResolution = {
  destination: string;
  permanent: false;
  statusCode: 307;
};

const staticLegacyRoutes = new Map<string, string>([
  ["/index.html", "/parfums"],
  ["/catalog.html", "/parfums/catalogo"],
  ["/combos.html", "/parfums/combos"],
  ["/checkout.html", "/parfums/checkout"],
  ["/mayorista.html", "/parfums/mayorista"],
  ["/nosotros.html", "/parfums/nosotros"],
  ["/contacto.html", "/parfums/contacto"],
  ["/privacidad.html", "/parfums/privacidad"],
  ["/terminos.html", "/parfums/terminos"],
]);

function withQueryAndHash(destination: string, legacyUrl: URL): string {
  const query = legacyUrl.searchParams.toString();
  return `${destination}${query ? `?${query}` : ""}${legacyUrl.hash}`;
}

export function resolveLegacyRoute(
  input: string,
  products: LegacyProductLookup,
): LegacyRouteResolution | null {
  const legacyUrl = new URL(input, "https://legacy.cruzial.test");

  if (legacyUrl.pathname === "/product.html") {
    const legacyId = legacyUrl.searchParams.get("id");
    if (!legacyId) return null;

    const product = products.findByLegacyId(legacyId);
    if (!product) return null;

    legacyUrl.searchParams.delete("id");
    return {
      destination: withQueryAndHash(
        `/parfums/productos/${encodeURIComponent(product.slug)}`,
        legacyUrl,
      ),
      permanent: false,
      statusCode: 307,
    };
  }

  const destination = staticLegacyRoutes.get(legacyUrl.pathname);
  if (!destination) return null;

  return {
    destination: withQueryAndHash(destination, legacyUrl),
    permanent: false,
    statusCode: 307,
  };
}
