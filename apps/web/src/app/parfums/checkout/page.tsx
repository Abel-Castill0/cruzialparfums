import type { Metadata } from "next";
import { CheckoutExperience } from "@/components/parfums/checkout/checkout-experience";
import { toCartCatalogProduct } from "@/domains/carts/parfums-cart-pricing";
import { restrictedDistrictNames } from "@/domains/commercial/delivery-zones";
import { loadParfumsStorefront } from "@/lib/catalog/parfums-storefront";
import { loadDeliveryZones } from "@/lib/commercial/delivery-zones";

export const metadata: Metadata = {
  title: "Revisa tu selección",
  description: "Revisa tu selección y continúa en WhatsApp para confirmar stock, envío y total final.",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const [{ catalog }, zones] = await Promise.all([loadParfumsStorefront(), loadDeliveryZones()]);

  return (
    <main id="main" tabIndex={-1}>
      <CheckoutExperience products={catalog.list().map(toCartCatalogProduct)} restrictedDistricts={restrictedDistrictNames(zones)} />
    </main>
  );
}
