import type { Metadata } from "next";
import { CatalogExperience } from "@/components/parfums/catalog/catalog-experience";
import { parseCatalogQuery } from "@/domains/catalog/catalog-query";
import { CatalogUnavailableNotice } from "@/components/parfums/catalog/catalog-unavailable-notice";
import { findPerfumes } from "@/domains/finder/finder-rules";
import { parseFinderAnswers } from "@/domains/finder/finder-url";
import { loadCatalogPage } from "@/lib/catalog/parfums-catalog-page";
import { loadParfumsStorefront } from "@/lib/catalog/parfums-storefront";

export const metadata: Metadata = {
  title: "Catálogo",
  description: "Catálogo de decants de 3, 5 y 10 ml de Cruzial Parfums.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The catalog's state is the URL: filters, search, order and view (`?vista=`). The server runs the query and sends only the
 * requested 24 products; the retired `format` and `price` params are ignored, so an old shared link shows the decant catalog.
 */
export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = parseCatalogQuery(params);
  const answers = parseFinderAnswers(params);
  const data = await loadCatalogPage(query);

  // The finder's recommendation is computed here, from the full catalog, so the browser only gets the four products it shows.
  let recommendation = null;
  if (answers) {
    const { catalog } = await loadParfumsStorefront();
    recommendation = { answers, products: findPerfumes(catalog.listFragrances(), answers).map((result) => result.product) };
  }

  return (
    <main id="main" tabIndex={-1}>
      {data.source === "unavailable" ? <CatalogUnavailableNotice /> : null}
      {/* Keyed by the answers so a new recommendation (arriving from the questionnaire over this same route) starts from fresh state. */}
      <CatalogExperience
        key={answers ? JSON.stringify(answers) : "all"}
        data={data}
        query={{ ...query, page: data.page }}
        recommendation={recommendation}
      />
    </main>
  );
}
