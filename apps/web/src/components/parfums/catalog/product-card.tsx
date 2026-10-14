"use client";

import type { Route } from "next";
import Image from "next/image";
import { MissingPhoto } from "../shared/missing-photo";
import Link from "next/link";
import { useId, useState } from "react";
import {
  addParfumsCartLine,
  PARFUMS_CART_UPDATED_EVENT,
} from "@/domains/carts/parfums-cart";
import { cartIdentity } from "@/domains/catalog/types";
import { isProductPurchasable } from "@/domains/catalog/availability";
import { decantSizeOptions, defaultDecantSize, type DecantSize } from "@/domains/catalog/catalog-query";
import type { CatalogProduct } from "@/domains/catalog/types";
import styles from "./catalog.module.css";
import { productMediaLinkLabel } from "./product-media-label";

function money(value: number) {
  return `S/ ${value.toFixed(2)}`;
}

/**
 * Card of the Parfums catalog. The catalog sells decants only, so the card offers the three sizes (3 / 5 / 10 ml) as a
 * radio group (the chosen one is solid ink with white text) and adds one unit of the chosen size; quantity is edited in
 * the cart. Whole bottles are not offered here.
 */
export function ProductCard({
  product,
  onAdded,
  eager = false,
}: {
  product: CatalogProduct;
  onAdded: (message: string) => void;
  eager?: boolean;
}) {
  const detailHref = `/parfums/productos/${product.slug}` as Route;
  const sizeOptions = decantSizeOptions(product);
  const firstAvailable = defaultDecantSize(sizeOptions);
  const [chosen, setChosen] = useState<DecantSize | null>(firstAvailable);
  const groupName = useId();
  const selected = sizeOptions.find((option) => option.size === chosen && option.available) ?? null;
  const shownPrice = selected?.price ?? sizeOptions.find((option) => option.size === firstAvailable)?.price ?? null;

  function addSelection() {
    if (!selected) return;
    const mutation = addParfumsCartLine(localStorage, {
      productId: cartIdentity(product),
      variantId: `decant-${selected.size}ml`,
      quantity: 1,
    });
    if (!mutation.persisted) {
      onAdded("No pudimos guardar tu selección. Revisa el almacenamiento del navegador.");
      return;
    }
    window.dispatchEvent(new Event(PARFUMS_CART_UPDATED_EVENT));
    onAdded(`${product.brand} ${product.name} · ${selected.size} ml añadido`);
  }

  if (!isProductPurchasable(product)) {
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
            ) : <MissingPhoto />}
            <span className={`${styles.tag} ${styles.discontinuedTag}`}>Agotado</span>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.identity}>
              <span className={styles.cardBrand}>{product.brand}</span>
              <h3 className={styles.cardName}>{product.name}</h3>
            </div>
            <div className={styles.cardMeta}>
              <span>Sin stock disponible</span>
              <strong data-price className={styles.soldOut}>Agotado</strong>
            </div>
          </div>
        </Link>
      </article>
    );
  }

  return (
    <article data-product-card className={styles.productCard} id={product.slug}>
      <div data-card-media className={styles.cardMedia}>
        <Link className={styles.cardMediaLink} href={detailHref} aria-label={productMediaLinkLabel(product)}>
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.imageAlt}
              fill
              sizes="(max-width: 359px) calc(100vw - 32px), (max-width: 767px) calc(50vw - 23px), (max-width: 1199px) 33vw, 25vw"
              className={styles.cardImage}
              loading={eager ? "eager" : "lazy"}
            />
          ) : <MissingPhoto />}
        </Link>
        <span className={`${styles.tag} ${product.discontinued ? styles.discontinuedTag : ""}`}>
          {product.discontinued ? "Descontinuado" : product.tag}
        </span>
      </div>
      <div className={styles.cardBody}>
        <Link className={styles.identity} href={detailHref}>
          <span className={styles.cardBrand}>{product.brand}</span>
          <h3 className={styles.cardName}>{product.name}</h3>
        </Link>
        <div className={styles.cardMeta}>
          <span>{selected ? `decant ${selected.size} ml` : "Elige un tamaño"}</span>
          <strong data-price>{shownPrice !== null ? money(shownPrice) : "—"}</strong>
        </div>
        <fieldset className={styles.sizePicker} data-size-picker>
          <legend className={styles.srOnly}>Tamaño del decant de {product.name}</legend>
          {sizeOptions.map((option) => (
            <label key={option.size} className={styles.sizeOption} data-unavailable={option.available ? undefined : ""}>
              <input
                type="radio"
                name={`${groupName}-size`}
                value={option.size}
                checked={chosen === option.size}
                disabled={!option.available}
                onChange={() => setChosen(option.size)}
              />
              <span>{option.size} ml</span>
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          className={styles.addButton}
          onClick={addSelection}
          disabled={!selected}
          aria-label={selected ? `Añadir ${product.name}, ${selected.size} ml` : `${product.name}: sin tamaños disponibles`}
        >
          Añadir
        </button>
      </div>
    </article>
  );
}
