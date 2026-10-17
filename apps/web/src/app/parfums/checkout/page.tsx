import type { Metadata } from "next";
import { CheckoutExperience } from "@/components/parfums/checkout/checkout-experience";
import { toCartCatalogProduct } from "@/domains/carts/parfums-cart-pricing";
import { listGiftCandidates } from "@/domains/commercial/gift";
import { restrictedDistrictNames } from "@/domains/commercial/delivery-zones";
import { loadParfumsStorefront } from "@/lib/catalog/parfums-storefront";
import { loadActiveGiftExclusions } from "@/lib/commercial/order-rules";
import { loadDeliveryZones } from "@/lib/commercial/delivery-zones";

export const metadata: Metadata = {
  title: "Revisa tu selección",
  description: "Revisa tu selección y continúa en WhatsApp para confirmar stock, envío y total final.",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const [{ catalog }, zones, giftExcludedProductIds] = await Promise.all([
    loadParfumsStorefront(),
    loadDeliveryZones(),
    loadActiveGiftExclusions(),
  ]);
  // The free 2 ml gift (docs/commercial-rules.md): the Arabic perfumes the customer may pick, minus the excluded ones
  // (the active `gift_exclusion` rule). Server and database still revalidate the choice on submit.
  const giftCandidates = listGiftCandidates(catalog.listFragrances(), giftExcludedProductIds);

  return (
    <main id="main" tabIndex={-1}>
      <CheckoutExperience products={catalog.list().map(toCartCatalogProduct)} restrictedDistricts={restrictedDistrictNames(zones)} giftCandidates={giftCandidates} />
    </main>
  );
}
