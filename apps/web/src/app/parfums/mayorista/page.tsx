import type { Metadata } from "next";
import { WholesaleExperience } from "@/components/parfums/wholesale/wholesale-experience";
import { PARFUMS_STORE_NAME } from "@/domains/platform/parfums-storefront";
import { loadParfumsStorefront } from "@/lib/catalog/parfums-storefront";

export const metadata: Metadata = {
  title: "Venta por mayor",
  description: "Frascos completos con descuento mayorista por categoría desde 40 unidades y cotización directa por WhatsApp.",
};

export default async function WholesalePage() {
  const { wholesale, contact } = await loadParfumsStorefront();

  return (
    <main>
      <WholesaleExperience
        offers={wholesale.offers}
        policies={wholesale.policies}
        storeName={PARFUMS_STORE_NAME}
        whatsappNumber={contact.whatsappNumber}
      />
    </main>
  );
}
