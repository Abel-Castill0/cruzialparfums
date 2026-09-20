import type { Metadata } from "next";
import { AnnouncementBar } from "@/components/parfums/shell/announcement-bar";
import { SiteFooter } from "@/components/parfums/shell/site-footer";
import { SiteHeader } from "@/components/parfums/shell/site-header";
import { WhatsAppAction } from "@/components/parfums/shell/whatsapp-action";
import { toCartCatalogProduct } from "@/domains/carts/parfums-cart-pricing";
import { PARFUMS_BRAND_MEDIA, PARFUMS_INSTAGRAM_URL } from "@/domains/platform/parfums-storefront";
import { loadParfumsStorefront } from "@/lib/catalog/parfums-storefront";

export const metadata: Metadata = {
  title: { default: "Cruzial Parfums", template: "%s — Cruzial Parfums" },
  description: "Decants premium y perfumes originales en Lima, Perú.",
};

export default async function ParfumsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { catalog, contact } = await loadParfumsStorefront();
  const { logoUrl } = PARFUMS_BRAND_MEDIA;
  const whatsappNumber = contact.whatsappNumber;
  const instagramUrl = PARFUMS_INSTAGRAM_URL;
  const searchProducts = catalog.listFragrances().map(({ slug, brand, name, notes, family, discontinued }) => ({ slug, brand, name, notes, family, discontinued }));
  const cartProducts = catalog.list().map(toCartCatalogProduct);

  return (
    <div data-storefront="parfums">
      <AnnouncementBar />
      <SiteHeader logoUrl={logoUrl} whatsappNumber={whatsappNumber} searchProducts={searchProducts} cartProducts={cartProducts} />
      {children}
      <SiteFooter logoUrl={logoUrl} whatsappNumber={whatsappNumber} instagramUrl={instagramUrl} />
      <WhatsAppAction number={whatsappNumber} floating />
    </div>
  );
}
