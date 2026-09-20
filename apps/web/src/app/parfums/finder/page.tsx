import type { Metadata } from "next";
import { FinderExperience } from "@/components/parfums/finder/finder-experience";
import { loadParfumsStorefront } from "@/lib/catalog/parfums-storefront";

export const metadata: Metadata = {
  title: "Encuentra tu fragancia",
  description: "Cuestionario local basado en familias, notas y preferencias del catálogo Cruzial Parfums.",
};

export default async function FinderPage() {
  const { catalog } = await loadParfumsStorefront();

  return (
    <main>
      <FinderExperience products={catalog.listFragrances()} />
    </main>
  );
}
