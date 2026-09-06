import type { CatalogProduct } from "../../domains/catalog/types";

export function buildSafeProductPageStructuredData(
  product: CatalogProduct,
  canonicalUrl?: string,
) {
  const pageId = canonicalUrl ? `${canonicalUrl}#webpage` : undefined;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        ...(pageId ? { "@id": pageId } : {}),
        name: `${product.name} — ${product.brand}`,
        description: `Consulta notas, concentración y formatos disponibles de ${product.name} de ${product.brand} en Cruzial Parfums.`,
        ...(canonicalUrl ? { url: canonicalUrl } : {}),
        isPartOf: { "@type": "WebSite", name: "Cruzial Parfums" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Catálogo" },
          { "@type": "ListItem", position: 2, name: product.name },
        ],
      },
    ],
  };
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
