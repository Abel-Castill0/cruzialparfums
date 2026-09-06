import type { Metadata } from "next";
import { WholesaleExperience } from "@/components/parfums/wholesale/wholesale-experience";
import { LegacyCatalogRepository } from "@/domains/catalog/legacy-catalog-repository";

export const metadata: Metadata = {
  title: "Venta por mayor",
  description: "Tarifas referenciales por volumen para frascos completos y cotización directa por WhatsApp.",
};

export default function WholesalePage() {
  const catalog = new LegacyCatalogRepository();
  const config = catalog.getStorefrontConfig();

  return (
    <main>
      <WholesaleExperience
        entries={catalog.listWholesale()}
        storeName={config.STORE ?? "Cruzial Parfums"}
        whatsappNumber={config.WA_NUMBER ?? "51924590921"}
      />
    </main>
  );
}
