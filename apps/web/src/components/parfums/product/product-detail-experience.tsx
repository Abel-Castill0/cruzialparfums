"use client";

import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ProductCard } from "@/components/parfums/catalog/product-card";
import {
  addParfumsCartLine,
  PARFUMS_CART_UPDATED_EVENT,
} from "@/domains/carts/parfums-cart";
import {
  calculatePurchaseTotal,
  clampPurchaseQuantity,
  listProductPurchaseVariants,
  resolveInitialProductVariant,
  type ProductPurchaseVariant,
} from "@/domains/catalog/product-purchase";
import { isProductPurchasable } from "@/domains/catalog/availability";
import {
  BOTTLE_GIFT_MESSAGE,
  isBottleGiftEligible,
} from "@/domains/catalog/promotion-eligibility";
import type { CatalogProduct } from "@/domains/catalog/types";
import {
  buildProductConsultationMessage,
  buildWhatsAppUrl,
} from "@/domains/whatsapp/parfums-message-builder";
import styles from "./product-detail.module.css";

function money(value: number) {
  return `S/ ${value.toFixed(2)}`;
}

function typeLabel(type: CatalogProduct["type"]) {
  if (type === "arab") return "Perfumería árabe";
  if (type === "niche") return "Nicho";
  if (type === "designer") return "Designer";
  return "Combo";
}

function genderLabel(gender: CatalogProduct["gender"]) {
  if (gender === "men") return "Hombre";
  if (gender === "women") return "Mujer";
  return "Unisex";
}

export function ProductDetailExperience({
  product,
  relatedProducts,
  initialVariant,
  atomizations,
  whatsappNumber,
  storeName,
}: {
  product: CatalogProduct;
  relatedProducts: CatalogProduct[];
  initialVariant: string | undefined;
  atomizations: Record<string, string>;
  whatsappNumber: string;
  storeName: string;
}) {
  const variants = listProductPurchaseVariants(product);
  const [selected, setSelected] = useState(() =>
    resolveInitialProductVariant(product, initialVariant),
  );
  const [quantity, setQuantity] = useState(1);
  const [toast, setToast] = useState("");
  const total = calculatePurchaseTotal(selected, quantity);
  const stageImage =
    selected.group === "bottle"
      ? product.bottleImageUrl
      : product.decantImageUrl;
  const consultation = buildProductConsultationMessage({
    storeName,
    brand: product.brand,
    productName: product.name,
    discontinued: product.discontinued,
  });

  function announce(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  function addSelection() {
    const mutation = addParfumsCartLine(localStorage, {
      productId: product.legacyId,
      variantId: selected.variantId,
      quantity,
    });
    if (!mutation.persisted) {
      announce("No pudimos guardar tu selección. Revisa el almacenamiento del navegador.");
      return;
    }
    window.dispatchEvent(new Event(PARFUMS_CART_UPDATED_EVENT));
    announce(
      `${quantity} × ${product.brand} ${product.name}, ${selected.size} ml añadido`,
    );
  }

  function selectVariant(variant: ProductPurchaseVariant) {
    setSelected(variant);
  }

  const decants = variants.filter((variant) => variant.group === "decant");
  const bottles = variants.filter((variant) => variant.group === "bottle");
  const purchasable = isProductPurchasable(product);

  return (
    <>
      <section className={styles.productDetail} data-product-detail>
        <div className={`${styles.productStage} ${!purchasable ? styles.stageDiscontinued : ""}`} data-product-stage>
          {stageImage ? (
            <div className={styles.imageFrame}>
              <Image
                src={stageImage}
                alt={product.imageAlt}
                fill
                sizes="(max-width: 1024px) calc(100vw - 32px), 46vw"
                className={styles.productImage}
                loading="eager"
              />
            </div>
          ) : null}
          <span className={`${styles.tag} ${!purchasable ? styles.discontinuedTag : ""}`}>
            {!purchasable ? "Agotado" : product.discontinued ? "Descontinuado" : product.tag}
          </span>
        </div>

        <div className={styles.productInfo}>
          <div className={styles.identityBlock}>
            <span className={styles.eyebrow}>{typeLabel(product.type)} · {product.concentration}</span>
            <span className={styles.brandLine}>{product.brand}</span>
            <h1>{product.name}</h1>
            <p className={styles.subline}>{genderLabel(product.gender)} · {product.family}</p>
          </div>

          {!purchasable ? (
            <div className={styles.discontinuedBlock} data-out-of-stock-block>
              <div className={styles.discontinuedNotice}>
                <strong>Este perfume está agotado.</strong>
                <p>No queda stock disponible por ahora. Consulta si hay una alternativa similar.</p>
              </div>
              <a className={styles.secondaryAction} target="_blank" rel="noopener noreferrer" href={buildWhatsAppUrl(whatsappNumber, consultation)}>
                Consultar disponibilidad <span aria-hidden="true">↗</span>
              </a>
            </div>
          ) : (
            <div className={styles.purchaseBlock} aria-label="Selecciona una presentación" data-purchase-block>
              {product.discontinued ? (
                <div className={styles.discontinuedNotice} data-discontinued-notice>
                  <strong>Este perfume fue descontinuado.</strong>
                  <p>Ya no se fabrica, pero seguimos teniendo unidades disponibles mientras dure el stock.</p>
                </div>
              ) : null}
              <div className={styles.variantSection}>
                <p className={styles.sectionLabel}>Decant · 3 · 5 · 10 ml</p>
                <div className={styles.sizeRow}>
                  {decants.map((variant) => (
                    <button key={variant.variantId} type="button" className={`${styles.sizeButton} ${selected.variantId === variant.variantId ? styles.selected : ""}`} aria-pressed={selected.variantId === variant.variantId} data-variant-id={variant.variantId} onClick={() => selectVariant(variant)}>
                      <strong>{variant.size} ml</strong><span>{money(variant.price)}</span>
                    </button>
                  ))}
                </div>
                <div className={styles.performance} aria-live="polite">
                  <span>Rendimiento</span>
                  <strong>{selected.group === "bottle" ? "Frasco sellado" : `≈ ${atomizations[String(selected.size)] ?? "—"} atomizaciones`}</strong>
                  <small>{selected.group === "bottle" ? `Original sellado · ${selected.size} ml` : `${selected.size === 3 ? "Decant clásico" : "Decant premium"} · ${selected.size} ml`}</small>
                </div>
              </div>

              {bottles.length > 0 ? (
                <div className={styles.bottleSection}>
                  <p className={styles.bottleLabel}>Frasco completo · original sellado</p>
                  <div className={styles.sizeRow}>
                    {bottles.map((variant) => (
                      <button key={variant.variantId} type="button" className={`${styles.sizeButton} ${selected.variantId === variant.variantId ? styles.selected : ""}`} aria-pressed={selected.variantId === variant.variantId} data-variant-id={variant.variantId} onClick={() => selectVariant(variant)}>
                        <strong>{variant.size} ml</strong><span>{money(variant.price)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className={styles.orderSummary}>
                <div className={styles.quantityControl}>
                  <span>Cantidad</span>
                  <div>
                    <button type="button" onClick={() => setQuantity((value) => clampPurchaseQuantity(value - 1))} disabled={quantity === 1} aria-label="Reducir cantidad">−</button>
                    <output aria-label="Cantidad seleccionada">{quantity}</output>
                    <button type="button" onClick={() => setQuantity((value) => clampPurchaseQuantity(value + 1))} disabled={quantity === 99} aria-label="Aumentar cantidad">+</button>
                  </div>
                </div>
                <div className={styles.total} aria-live="polite" data-product-total>
                  <span>Total</span><strong>{money(total)}</strong>
                </div>
              </div>

              <div className={styles.detailActions}>
                <button type="button" className={styles.primaryAction} data-primary-action onClick={addSelection}>Añadir al carrito · {money(total)}</button>
                <a className={styles.secondaryAction} target="_blank" rel="noopener noreferrer" href={buildWhatsAppUrl(whatsappNumber, consultation)}>Consultar <span aria-hidden="true">↗</span></a>
              </div>
              <p className={styles.actionNote}>Se añadirá esta presentación al carrito. Envío, disponibilidad y total final se confirman en WhatsApp; la web no procesa pagos.</p>
              {isBottleGiftEligible(selected.group) ? (
                <p className={styles.giftNote} data-bottle-gift-note>{BOTTLE_GIFT_MESSAGE}</p>
              ) : null}
            </div>
          )}

          <div className={styles.descriptionBlock}>
            <p>{product.description}</p>
          </div>

          <dl className={styles.metaRow}>
            <div><dt>Concentración</dt><dd>{product.concentration}</dd></div>
            <div><dt>Familia</dt><dd>{product.family}</dd></div>
            <div><dt>Desde</dt><dd>{money(Math.min(...Object.values(product.decantPrices)))}</dd></div>
          </dl>

          <div className={styles.notesBlock}>
            <p className={styles.sectionLabel}>Notas principales</p>
            <div className={styles.noteChips}>{product.notes.map((note) => <span key={note}>{note}</span>)}</div>
          </div>

          {product.bottlePrices ? (
            <div className={styles.wholesaleLink}>
              <span aria-hidden="true">✦</span>
              <div><strong>¿Necesitas varias unidades?</strong><p>Las compras por volumen se atienden desde Mayorista.</p></div>
              <Link href={"/parfums/mayorista" as Route}>Ver Mayorista →</Link>
            </div>
          ) : null}
        </div>
      </section>

      <section className={styles.relatedSection} aria-labelledby="related-heading">
        <div className={styles.relatedHeading}>
          <div><p className={styles.eyebrow}>Completa tu selección</p><h2 id="related-heading">También te <em>interesará</em></h2></div>
          <Link href="/parfums/catalogo">Ver catálogo completo <span aria-hidden="true">→</span></Link>
        </div>
        <div className={styles.relatedGrid}>
          {relatedProducts.map((related, index) => (
            <ProductCard key={related.legacyId} product={related} mode="decant" onAdded={announce} eager={index < 2} />
          ))}
        </div>
      </section>
      <div className={`${styles.toast} ${toast ? styles.toastVisible : ""}`} role="status" aria-live="polite">{toast}</div>
    </>
  );
}
