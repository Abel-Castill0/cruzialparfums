import type { Metadata } from "next";
import { CatalogExperience } from "@/components/parfums/catalog/catalog-experience";
import {
  DEFAULT_CATALOG_FILTERS,
  type CatalogFilters,
  type CatalogSort,
} from "@/domains/catalog/catalog-query";
import { CatalogUnavailableNotice } from "@/components/parfums/catalog/catalog-unavailable-notice";
import { parseFinderAnswers } from "@/domains/finder/finder-url";
import { loadParfumsStorefront } from "@/lib/catalog/parfums-storefront";

export const metadata: Metadata = {
  title: "Catálogo",
  description: "Catálogo de decants de 3, 5 y 10 ml de Cruzial Parfums.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function scalar(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const initialFilters: CatalogFilters = {
    ...DEFAULT_CATALOG_FILTERS,
    gender: scalar(params.gender) ?? "all",
    family: scalar(params.family) ?? "all",
    type: scalar(params.type) ?? "all",
    brand: scalar(params.brand) ?? "all",
    // Retired filters (whole bottles and budget): a shared link that still carries them just shows the full decant catalog.
    format: "all",
    price: "all",
    sort: (scalar(params.sort) ?? "featured") as CatalogSort,
    search: scalar(params.search) ?? "",
  };
  const recommendation = parseFinderAnswers(params);
  const { catalog, source } = await loadParfumsStorefront();
  const products = catalog.listFragrances();

  return (
    <main id="main" tabIndex={-1}>
      {source === "unavailable" ? <CatalogUnavailableNotice /> : null}
      {/* Keyed by the answers so a new recommendation (arriving from the
          questionnaire over this same route) starts from fresh state. */}
      <CatalogExperience
        key={recommendation ? JSON.stringify(recommendation) : "all"}
        products={products}
        initialFilters={initialFilters}
        initialPage={Number.parseInt(scalar(params.vista) ?? "1", 10) || 1}
        initialRecommendation={recommendation}
      />
    </main>
  );
}
