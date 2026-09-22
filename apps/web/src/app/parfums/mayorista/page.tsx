import type { Metadata } from "next";
import { WholesaleExperience } from "@/components/parfums/wholesale/wholesale-experience";
import { PARFUMS_STORE_NAME } from "@/domains/platform/parfums-storefront";
import { loadParfumsStorefront } from "@/lib/catalog/parfums-storefront";

export async function generateMetadata(): Promise<Metadata> {
  const { wholesale } = await loadParfumsStorefront();
  const minQuantities = wholesale.policies.map((policy) => policy.minQuantity).filter((value) => value > 0);
  const threshold = minQuantities.length > 0 ? Math.min(...minQuantities) : null;
  return {
    title: "Venta por mayor",
    description: threshold !== null
      ? `Frascos completos con descuento mayorista por categoría desde ${threshold} unidades y cotización directa por WhatsApp.`
      : "Frascos completos con descuento mayorista por categoría y cotización directa por WhatsApp.",
  };
}

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
