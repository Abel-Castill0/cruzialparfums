import type { Metadata } from "next";
import { FinderExperience } from "@/components/parfums/finder/finder-experience";
import { LegacyCatalogRepository } from "@/domains/catalog/legacy-catalog-repository";

export const metadata: Metadata = {
  title: "Encuentra tu fragancia",
  description: "Cuestionario local basado en familias, notas y preferencias del catálogo Cruzial Parfums.",
};

export default function FinderPage() {
  return (
    <main>
      <FinderExperience products={new LegacyCatalogRepository().listFragrances()} />
    </main>
  );
}
