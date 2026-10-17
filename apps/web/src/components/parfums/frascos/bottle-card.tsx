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
import {
  bottleSizeOptions,
  defaultBottleSize,
  type CatalogBottleCardProduct,
} from "@/domains/catalog/bottle-card-product";
import catalog from "../catalog/catalog.module.css";
import { productMediaLinkLabel } from "../catalog/product-media-label";
import styles from "./frascos.module.css";

function money(value: number) {
  return `S/ ${value.toFixed(2)}`;
}

/**
 * Card of the whole-bottle catalog. Offers the sealed bottle sizes (usually 50
 * and 100 ml) as a radio group and adds one unit of the chosen size; quantity is
 * edited in the cart. Decants are never offered here.
 */
export function BottleCard({
  product,
  onAdded,
  eager = false,
}: {
  product: CatalogBottleCardProduct;
  onAdded: (message: string) => void;
  eager?: boolean;
}) {
  const detailHref = `/parfums/productos/${product.slug}` as Route;
  const sizeOptions = bottleSizeOptions(product);
  const firstAvailable = defaultBottleSize(sizeOptions);
  const [chosen, setChosen] = useState<number | null>(firstAvailable);
  const groupName = useId();
  const selected = sizeOptions.find((option) => option.size === chosen && option.available) ?? null;
  const shownPrice = selected?.price ?? sizeOptions.find((option) => option.size === firstAvailable)?.price ?? null;

  function addSelection() {
    if (!selected) return;
    const mutation = addParfumsCartLine(localStorage, {
      productId: cartIdentity(product),
      variantId: `bottle-${selected.size}ml`,
      quantity: 1,
    });
    if (!mutation.persisted) {
      onAdded("No pudimos guardar tu selección. Revisa el almacenamiento del navegador.");
      return;
    }
    window.dispatchEvent(new Event(PARFUMS_CART_UPDATED_EVENT));
    onAdded(`${product.brand} ${product.name} · frasco ${selected.size} ml añadido`);
  }

  if (!isProductPurchasable(product)) {
    return (
      <article data-bottle-card className={`${catalog.productCard} ${catalog.discontinued}`} id={product.slug}>
        <Link href={detailHref} className={catalog.discontinuedLink}>
          <div data-card-media className={catalog.cardMedia}>
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={product.imageAlt}
                fill
                sizes="(max-width: 599px) calc(100vw - 32px), (max-width: 1024px) calc(50vw - 23px), 33vw"
                className={catalog.cardImage}
                loading={eager ? "eager" : "lazy"}
              />
            ) : <MissingPhoto />}
            <span className={`${catalog.tag} ${catalog.discontinuedTag}`}>Agotado</span>
          </div>
          <div className={catalog.cardBody}>
            <div className={catalog.identity}>
              <span className={catalog.cardBrand}>{product.brand}</span>
              <h3 className={catalog.cardName}>{product.name}</h3>
            </div>
            <div className={catalog.cardMeta}>
              <span>Sin stock disponible</span>
              <strong data-price className={catalog.soldOut}>Agotado</strong>
            </div>
          </div>
        </Link>
      </article>
    );
  }

  return (
    <article data-bottle-card className={catalog.productCard} id={product.slug}>
      <div data-card-media className={catalog.cardMedia}>
        <Link className={catalog.cardMediaLink} href={detailHref} aria-label={productMediaLinkLabel(product)}>
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.imageAlt}
              fill
              sizes="(max-width: 599px) calc(100vw - 32px), (max-width: 1024px) calc(50vw - 23px), 33vw"
              className={catalog.cardImage}
              loading={eager ? "eager" : "lazy"}
            />
          ) : <MissingPhoto />}
        </Link>
        <span className={`${catalog.tag} ${product.discontinued ? catalog.discontinuedTag : ""}`}>
          {product.discontinued ? "Descontinuado" : "Frasco completo"}
        </span>
      </div>
      <div className={catalog.cardBody}>
        <Link className={catalog.identity} href={detailHref}>
          <span className={catalog.cardBrand}>{product.brand}</span>
          <h3 className={catalog.cardName}>{product.name}</h3>
        </Link>
        <div className={catalog.cardMeta}>
          <span>{selected ? `frasco ${selected.size} ml` : "Elige un tamaño"}</span>
          <strong data-price>{shownPrice !== null ? money(shownPrice) : "—"}</strong>
        </div>
        <fieldset className={`${catalog.sizePicker} ${styles.bottleSizePicker}`} data-size-picker>
          <legend className={catalog.srOnly}>Tamaño del frasco de {product.name}</legend>
          {sizeOptions.map((option) => (
            <label key={option.size} className={catalog.sizeOption} data-unavailable={option.available ? undefined : ""}>
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
          className={catalog.addButton}
          onClick={addSelection}
          disabled={!selected}
          aria-label={selected ? `Añadir ${product.name}, frasco ${selected.size} ml` : `${product.name}: sin frascos disponibles`}
        >
          Añadir
        </button>
      </div>
    </article>
  );
}
