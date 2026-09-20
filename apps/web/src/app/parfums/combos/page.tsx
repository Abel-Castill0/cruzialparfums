import type { Metadata } from "next";
import { CombosExperience } from "@/components/parfums/combos/combos-experience";
import { PARFUMS_STORE_NAME } from "@/domains/platform/parfums-storefront";
import { loadParfumsStorefront } from "@/lib/catalog/parfums-storefront";

export const metadata: Metadata = {
  title: "Combos",
  description: "Explora los sets Cruzial Parfums o arma una selección de 3 a 6 fragancias con el tamaño de cada una por separado.",
};

export default async function CombosPage() {
  const { catalog, contact } = await loadParfumsStorefront();

  return (
    <main>
      <CombosExperience
        combos={catalog.listCombos()}
        products={catalog.listFragrances()}
        whatsappNumber={contact.whatsappNumber}
        storeName={PARFUMS_STORE_NAME}
      />
    </main>
  );
}
