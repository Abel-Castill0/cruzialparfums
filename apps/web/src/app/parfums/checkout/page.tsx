import type { Metadata } from "next";
import { CheckoutExperience } from "@/components/parfums/checkout/checkout-experience";
import { LegacyCatalogRepository } from "@/domains/catalog/legacy-catalog-repository";
import { PARFUMS_SETTINGS } from "@/domains/platform/settings";

export const metadata: Metadata = {
  title: "Revisa tu selección",
  description: "Revisa tu selección y continúa en WhatsApp para confirmar stock, envío y total final.",
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  const catalog = new LegacyCatalogRepository();
  const config = catalog.getStorefrontConfig();

  return (
    <main>
      <CheckoutExperience
        products={catalog.list()}
        whatsappNumber={config.WA_NUMBER ?? PARFUMS_SETTINGS.whatsappNumber}
        storeName={config.STORE ?? "Cruzial Parfums"}
      />
    </main>
  );
}
