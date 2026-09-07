import type { Metadata } from "next";
import { CombosExperience } from "@/components/parfums/combos/combos-experience";
import { LegacyCatalogRepository } from "@/domains/catalog/legacy-catalog-repository";
import { PARFUMS_SETTINGS } from "@/domains/platform/settings";

export const metadata: Metadata = {
  title: "Combos",
  description: "Explora los sets legacy de Cruzial Parfums o arma una selección de 3 a 6 fragancias.",
};

export default function CombosPage() {
  const catalog = new LegacyCatalogRepository();
  const config = catalog.getStorefrontConfig();

  return (
    <main>
      <CombosExperience
        combos={catalog.listCombos()}
        products={catalog.listFragrances()}
        whatsappNumber={config.WA_NUMBER ?? PARFUMS_SETTINGS.whatsappNumber}
        storeName={config.STORE ?? "Cruzial Parfums"}
      />
    </main>
  );
}
