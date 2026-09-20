import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/parfums/navigation/breadcrumbs";
import { ProductDetailExperience } from "@/components/parfums/product/product-detail-experience";
import { PARFUMS_ATOMIZATIONS, PARFUMS_STORE_NAME } from "@/domains/platform/parfums-storefront";
import { loadParfumsStorefront } from "@/lib/catalog/parfums-storefront";
import { resolveCanonicalUrl } from "@/lib/seo/canonical-url";
import {
  buildSafeProductPageStructuredData,
  serializeJsonLd,
} from "@/lib/seo/product-structured-data";
import styles from "./product-page.module.css";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ variant?: string | string[] }>;
};

function productDescription(name: string, brand: string) {
  return `Consulta notas, concentración y formatos disponibles de ${name} de ${brand} en Cruzial Parfums.`;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { catalog } = await loadParfumsStorefront();
  const product = catalog.findBySlug(slug);
  if (!product || product.type === "combo") {
    return { title: "Fragancia no encontrada", robots: { index: false, follow: false } };
  }

  const canonical = resolveCanonicalUrl(
    `/parfums/productos/${product.slug}`,
    process.env.NEXT_PUBLIC_SITE_URL,
  );
  const description = productDescription(product.name, product.brand);
  const image = product.bottleImageUrl ?? product.decantImageUrl;

  return {
    title: `${product.name} — ${product.brand}`,
    description,
    ...(canonical ? { alternates: { canonical } } : {}),
    openGraph: {
      type: "website",
      locale: "es_PE",
      siteName: "Cruzial Parfums",
      title: `${product.name} — ${product.brand}`,
      description,
      ...(canonical ? { url: canonical } : {}),
      ...(image ? { images: [{ url: image, alt: product.imageAlt }] } : {}),
    },
  };
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { catalog, contact } = await loadParfumsStorefront();
  const product = catalog.findBySlug(slug);
  if (!product || product.type === "combo") notFound();

  const canonical = resolveCanonicalUrl(
    `/parfums/productos/${product.slug}`,
    process.env.NEXT_PUBLIC_SITE_URL,
  );
  const initialVariant = typeof query.variant === "string" ? query.variant : undefined;
  const safeStructuredData = buildSafeProductPageStructuredData(product, canonical);

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <Breadcrumbs items={[{ label: "Catálogo", href: "/parfums/catalogo" }, { label: product.name }]} />
        <ProductDetailExperience
          product={product}
          relatedProducts={catalog.listRelated(product)}
          initialVariant={initialVariant}
          atomizations={PARFUMS_ATOMIZATIONS}
          whatsappNumber={contact.whatsappNumber}
          storeName={PARFUMS_STORE_NAME}
        />
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(safeStructuredData) }} />
    </main>
  );
}
