import type { Metadata } from "next";
import { CheckoutExperience } from "@/components/parfums/checkout/checkout-experience";
import { toCartCatalogProduct } from "@/domains/carts/parfums-cart-pricing";
import { loadParfumsStorefront } from "@/lib/catalog/parfums-storefront";

export const metadata: Metadata = {
  title: "Revisa tu selección",
  description: "Revisa tu selección y continúa en WhatsApp para confirmar stock, envío y total final.",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const { catalog } = await loadParfumsStorefront();

  return (
    <main>
      <CheckoutExperience products={catalog.list().map(toCartCatalogProduct)} />
    </main>
  );
}
