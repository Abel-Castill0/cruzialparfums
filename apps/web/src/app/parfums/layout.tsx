import type { Metadata } from "next";
import { AnnouncementBar } from "@/components/parfums/shell/announcement-bar";
import { SiteFooter } from "@/components/parfums/shell/site-footer";
import { SiteHeader } from "@/components/parfums/shell/site-header";
import { WhatsAppAction } from "@/components/parfums/shell/whatsapp-action";
import { LegacyCatalogRepository } from "@/domains/catalog/legacy-catalog-repository";

export const metadata: Metadata = {
  title: { default: "Cruzial Parfums", template: "%s — Cruzial Parfums" },
  description: "Decants premium y perfumes originales en Lima, Perú.",
};

export default function ParfumsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const catalog = new LegacyCatalogRepository();
  const config = catalog.getStorefrontConfig();
  const { logoUrl } = catalog.getBrandMedia();
  const whatsappNumber = config.WA_NUMBER ?? "51924590921";
  const instagramUrl = config.INSTAGRAM_URL ?? "https://www.instagram.com/Cruzial_parfum/";
  const searchProducts = catalog.listFragrances().map(({ slug, brand, name, notes, family, discontinued }) => ({ slug, brand, name, notes, family, discontinued }));

  return (
    <div data-storefront="parfums">
      <AnnouncementBar />
      <SiteHeader logoUrl={logoUrl} whatsappNumber={whatsappNumber} searchProducts={searchProducts} />
      {children}
      <SiteFooter logoUrl={logoUrl} whatsappNumber={whatsappNumber} instagramUrl={instagramUrl} />
      <WhatsAppAction number={whatsappNumber} floating />
    </div>
  );
}
