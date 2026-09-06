"use client";

import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  addParfumsCartLine,
  PARFUMS_CART_UPDATED_EVENT,
} from "@/domains/carts/parfums-cart";
import { minimumPrice } from "@/domains/catalog/catalog-query";
import type { CatalogProduct } from "@/domains/catalog/types";
import styles from "./catalog.module.css";

type CardMode = "decant" | "bottle";

function money(value: number) {
  return `S/ ${value.toFixed(2)}`;
}

function smallestVariant(prices: Record<string, number>) {
  const size = Math.min(...Object.keys(prices).map(Number));
  return { size, price: prices[String(size)] ?? minimumPrice(prices) };
}

export function ProductCard({
  product,
  mode,
  onAdded,
  eager = false,
}: {
  product: CatalogProduct;
  mode: CardMode;
  onAdded: (message: string) => void;
  eager?: boolean;
}) {
  const detailHref = `/parfums/productos/${product.slug}` as Route;
  const bottleVariant = product.bottlePrices
    ? smallestVariant(product.bottlePrices)
    : null;
  const decantVariant = smallestVariant(product.decantPrices);
  const currentVariant =
    mode === "bottle" && bottleVariant ? bottleVariant : decantVariant;
  const currentPrices =
    mode === "bottle" && product.bottlePrices
      ? product.bottlePrices
      : product.decantPrices;

  function addQuickVariant() {
    const group = mode === "bottle" ? "bottle" : "decant";
    const mutation = addParfumsCartLine(localStorage, {
      productId: product.legacyId,
      variantId: `${group}-${currentVariant.size}ml`,
      quantity: 1,
    });
    if (!mutation.persisted) {
      onAdded("No pudimos guardar tu selección. Revisa el almacenamiento del navegador.");
      return;
    }
    window.dispatchEvent(new Event(PARFUMS_CART_UPDATED_EVENT));
    onAdded(
      `${product.brand} ${product.name} · ${currentVariant.size} ml añadido`,
    );
  }

  if (product.discontinued) {
    return (
      <article data-product-card className={`${styles.productCard} ${styles.discontinued}`} id={product.slug}>
        <Link href={detailHref} className={styles.discontinuedLink}>
          <div data-card-media className={styles.cardMedia}>
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={product.imageAlt}
                fill
                sizes="(max-width: 359px) calc(100vw - 32px), (max-width: 767px) calc(50vw - 23px), (max-width: 1199px) 33vw, 25vw"
                className={styles.cardImage}
                loading={eager ? "eager" : "lazy"}
              />
            ) : null}
            <span className={`${styles.tag} ${styles.discontinuedTag}`}>Descontinuado</span>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.identity}>
              <span className={styles.cardBrand}>{product.brand}</span>
              <h2 className={styles.cardName}>{product.name}</h2>
            </div>
            <div className={styles.cardMeta}>
              <span>Sin reposición</span>
              <strong data-price className={styles.soldOut}>Agotado</strong>
            </div>
            <div className={styles.bottleSlot} />
          </div>
        </Link>
      </article>
    );
  }

  const crossSell =
    mode === "bottle"
      ? {
          href: detailHref,
          label: `Decant desde ${money(decantVariant.price)}`,
        }
      : bottleVariant
        ? {
            href: `${detailHref}?variant=bottle` as Route,
            label: `Frasco ${bottleVariant.size} ml · ${money(bottleVariant.price)}`,
          }
        : null;

  return (
    <article data-product-card className={styles.productCard} id={product.slug}>
      <div data-card-media className={styles.cardMedia}>
        <Link className={styles.cardMediaLink} href={detailHref} aria-label={`Ver ${product.brand} ${product.name}`}>
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.imageAlt}
              fill
              sizes="(max-width: 359px) calc(100vw - 32px), (max-width: 767px) calc(50vw - 23px), (max-width: 1199px) 33vw, 25vw"
              className={styles.cardImage}
              loading={eager ? "eager" : "lazy"}
            />
          ) : null}
        </Link>
        <span className={styles.tag}>{product.tag}</span>
        <button type="button" className={styles.quickAdd} onClick={addQuickVariant} aria-label={`Añadir ${product.name}, ${currentVariant.size} ml`} title="Añadir al carrito">+</button>
      </div>
      <div className={styles.cardBody}>
        <Link className={styles.identity} href={detailHref}>
          <span className={styles.cardBrand}>{product.brand}</span>
          <h2 className={styles.cardName}>{product.name}</h2>
        </Link>
        <div className={styles.cardMeta}>
          <span>{mode === "bottle" ? `frasco ${currentVariant.size} ml` : "desde 3 ml"}</span>
          <strong data-price>{money(minimumPrice(currentPrices))}</strong>
        </div>
        <div className={styles.bottleSlot}>
          {crossSell ? (
            <Link href={crossSell.href} className={styles.bottleLink}>
              {crossSell.label} <span aria-hidden="true">→</span>
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
