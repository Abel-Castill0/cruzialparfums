import { FinderExperience } from "@/components/parfums/finder/finder-experience";
import { sanitizeCatalogQuery } from "@/domains/finder/finder-url";
import { loadParfumsStorefront } from "@/lib/catalog/parfums-storefront";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Soft navigation to /parfums/finder (from any Parfums page) opens the
// questionnaire over the page the visitor is on. A direct visit or a refresh
// renders ../../finder/page.tsx instead.
export default async function FinderModal({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { catalog } = await loadParfumsStorefront();
  const catalogQuery = sanitizeCatalogQuery(typeof params.catalog === "string" ? params.catalog : undefined).toString();
  return <FinderExperience products={catalog.listFragrances()} catalogQuery={catalogQuery} intercepted />;
}
