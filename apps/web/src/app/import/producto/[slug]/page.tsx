import type { Metadata, Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ImportAddToCartButton } from "@/components/import/cart/import-add-to-cart";
import {
  availabilityLabel,
  formatCampaignPrice,
  presentationClassLabel,
} from "@/domains/import/public-import";
import { PublicImportRepository } from "@/domains/import/public-import-repository";
import { readImportPublicContact } from "@/domains/import/import-public-contact";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";
import styles from "./page.module.css";

type ProductPageProps = { params: Promise<{ slug: string }> };

const readProduct = cache(async (slug: string) => {
  const supabase = createSupabasePublicServerClient();
  if (!supabase) return null;
  const [product, contact] = await Promise.all([
    new PublicImportRepository(supabase).readProduct(slug),
    readImportPublicContact(supabase),
  ]);
  return product ? { ...product, contact } : null;
});

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await readProduct(slug);
  if (!result) return { title: "Producto no disponible" };
  const identity = result.product.brand
    ? `${result.product.brand} ${result.product.name}`
    : result.product.name;
  return {
    title: identity,
    description: `${identity}. Presentaciones y precios del consolidado #${result.campaign.number}.`,
  };
}

function formatClosingDate(value: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "long",
    timeZone: "America/Lima",
  }).format(new Date(value));
}

export default async function ImportProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const result = await readProduct(slug);
  if (!result) notFound();
  const { product, campaign, contact } = result;
  const waUrl = contact
    ? `https://wa.me/${contact.whatsappNumber}?text=${encodeURIComponent("Hola Cruzial Import, quiero información sobre el consolidado vigente.")}`
    : "";

  return (
    <main className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Ruta de navegación">
        <Link href="/import">Cruzial Import</Link><span aria-hidden="true">/</span><span>{product.name}</span>
      </nav>

      <article className={styles.product}>
        <div className={styles.media}>
          <div className={styles.mediaFrame}>
            <Image
              src={product.mediaUrl}
              alt={product.mediaAlt}
              fill
              loading="eager"
              sizes="(max-width: 767px) 100vw, 48vw"
            />
          </div>
        </div>
        <div className={styles.content}>
          <p className={styles.campaign}>Consolidado #{campaign.number}</p>
          {product.brand ? <p className={styles.brand}>{product.brand}</p> : null}
          <h1>{product.name}</h1>
          {product.categoryName ? <p className={styles.category}>{product.categoryName}</p> : null}

          <div className={styles.context}>
            <strong>{campaign.name}</strong>
            <span>Precios exclusivos de este consolidado</span>
            {campaign.closesAt ? <span>Cierre: {formatClosingDate(campaign.closesAt)}</span> : null}
          </div>

          <section className={styles.presentations} aria-labelledby="presentations-title">
            <h2 id="presentations-title">Presentaciones</h2>
            {product.presentations.map((presentation) => (
              <article key={presentation.id}>
                <div>
                  <h3>{presentation.label}</h3>
                  <p>{presentationClassLabel(presentation.presentationClass)}</p>
                </div>
                <div className={styles.price}>
                  <strong>{formatCampaignPrice(presentation.price, presentation.currency)}</strong>
                  <span data-availability={presentation.availability}>
                    {availabilityLabel(presentation.availability)}
                  </span>
                </div>
              </article>
            ))}
          </section>

          <div className={styles.cartSection}>
            <h2>Agregar al carrito</h2>
            {product.presentations.filter((p) => p.availability === "available").length > 0 ? (
              <div className={styles.presentationCartList}>
                {product.presentations.map((presentation) => (
                  <div key={presentation.id} className={styles.presentationCartItem}>
                    <span className={styles.presentationCartLabel}>{presentation.label}</span>
                    <ImportAddToCartButton
                      line={{
                        offerId: presentation.offerId,
                        offerUpdatedAt: presentation.offerUpdatedAt,
                        label: presentation.label,
                        productName: product.name,
                        price: presentation.price,
                        currency: presentation.currency,
                        quantity: 1,
                      }}
                      disabled={presentation.availability !== "available"}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.allOutOfStock}>Todas las presentaciones están agotadas.</p>
            )}
          </div>

          <div className={styles.actions}>
            {waUrl ? (
              <a href={waUrl} target="_blank" rel="noopener noreferrer">Consultar por WhatsApp</a>
            ) : (
              <span role="status">El canal de contacto no está disponible temporalmente.</span>
            )}
            <Link href={"/import#catalogo" as Route}>Volver al catálogo</Link>
          </div>
        </div>
      </article>
    </main>
  );
}
