import type { Metadata } from "next";
import { FrascosExperience } from "@/components/parfums/frascos/frascos-experience";
import { CatalogUnavailableNotice } from "@/components/parfums/catalog/catalog-unavailable-notice";
import { parseCatalogQuery } from "@/domains/catalog/catalog-query";
import { loadFrascosPage } from "@/lib/catalog/parfums-frascos-page";

export const metadata: Metadata = {
  title: "Perfumes enteros",
  description: "Frascos completos originales y sellados de Cruzial Parfums.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The whole-bottle catalog. Same URL-state contract as the decant catalog (`search`, `brand`, `type`, `sort`, `vista`),
 * but the server only ever sends products that have a sealed-bottle offer.
 */
export default async function FrascosPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = parseCatalogQuery(params);
  const data = await loadFrascosPage(query);

  return (
    <main id="main" tabIndex={-1}>
      {data.source === "unavailable" ? <CatalogUnavailableNotice /> : null}
      <FrascosExperience data={data} query={{ ...query, page: data.page }} />
    </main>
  );
}
