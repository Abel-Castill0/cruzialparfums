import type { Metadata } from "next";
import { CatalogExperience } from "@/components/parfums/catalog/catalog-experience";
import {
  DEFAULT_CATALOG_FILTERS,
  type CatalogFilters,
  type CatalogSort,
} from "@/domains/catalog/catalog-query";
import { CatalogUnavailableNotice } from "@/components/parfums/catalog/catalog-unavailable-notice";
import { loadParfumsStorefront } from "@/lib/catalog/parfums-storefront";

export const metadata: Metadata = {
  title: "Catálogo",
  description: "Catálogo completo de decants y frascos Cruzial Parfums.",
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
    format: scalar(params.format) ?? "all",
    price: scalar(params.price) ?? "all",
    sort: (scalar(params.sort) ?? "featured") as CatalogSort,
    search: scalar(params.search) ?? "",
  };
  const { catalog, source } = await loadParfumsStorefront();
  const products = catalog.listFragrances();

  return (
    <main>
      {source === "unavailable" ? <CatalogUnavailableNotice /> : null}
      <CatalogExperience products={products} initialFilters={initialFilters} />
    </main>
  );
}
