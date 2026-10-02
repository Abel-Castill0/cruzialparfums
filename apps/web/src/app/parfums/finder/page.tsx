import type { Metadata } from "next";
import { FinderExperience } from "@/components/parfums/finder/finder-experience";
import { sanitizeCatalogQuery } from "@/domains/finder/finder-url";
import { loadParfumsStorefront } from "@/lib/catalog/parfums-storefront";

export const metadata: Metadata = {
  title: "Encuentra tu fragancia",
  description: "Cuestionario local basado en familias, notas y preferencias del catálogo Cruzial Parfums.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function FinderPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { catalog } = await loadParfumsStorefront();
  const catalogQuery = sanitizeCatalogQuery(typeof params.catalog === "string" ? params.catalog : undefined).toString();

  return (
    <main>
      <FinderExperience products={catalog.listFragrances()} catalogQuery={catalogQuery} />
    </main>
  );
}
