"use client";

import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  addParfumsCartLine,
  PARFUMS_CART_UPDATED_EVENT,
} from "@/domains/carts/parfums-cart";
import { cartIdentity } from "@/domains/catalog/types";
import type { CatalogProduct } from "@/domains/catalog/types";
import { listProductPurchaseVariants } from "@/domains/catalog/product-purchase";
import {
  findPerfumes,
  finderConfidence,
  finderScoreLabel,
  finderWhyText,
  type FinderAnswers,
} from "@/domains/finder/finder-rules";
import styles from "./finder.module.css";

function money(value: number) {
  return `S/ ${value.toFixed(2)}`;
}

/**
 * The recommendation, computed from a completed questionnaire by the real
 * finder rules. It lives on the catalog page: the questionnaire only collects
 * answers and hands over once it is complete.
 */
export function RecommendationPanel({ products, answers, redoHref, onClear, onNotice }: {
  products: CatalogProduct[];
  answers: FinderAnswers;
  redoHref: Route;
  onClear: () => void;
  onNotice: (message: string) => void;
}) {
  const results = findPerfumes(products, answers);
  const confidence = finderConfidence(results);
  const heading = confidence === "weak"
    ? "No encontramos una coincidencia perfecta"
    : confidence === "close"
      ? "Estas opciones encajan bien contigo"
      : "Tu mejor coincidencia";
  const intro = confidence === "weak"
    ? "Estas son las opciones que más se acercan a lo que nos contaste. Compáralas antes de elegir."
    : confidence === "close"
      ? "Varias fragancias respondieron de forma similar a tus preferencias."
      : "Resultado calculado con tus respuestas, datos del catálogo y una clasificación editorial de intensidad.";

  function smallestOrderableDecant(product: CatalogProduct) {
    // Never hardcode a size — today's catalog happens to have 3 ml on every
    // eligible fragrance, but that's brittle. Pick whichever decant is
    // actually smallest and has a price, per product.
    return listProductPurchaseVariants(product)
      .filter((variant) => variant.group === "decant")
      .at(0);
  }

  function add(product: CatalogProduct) {
    const decant = smallestOrderableDecant(product);
    if (!decant) {
      onNotice("Este perfume no tiene un decant disponible por ahora.");
      return;
    }
    const mutation = addParfumsCartLine(localStorage, {
      productId: cartIdentity(product),
      variantId: decant.variantId,
      quantity: 1,
    });
    if (!mutation.persisted) {
      onNotice("No pudimos guardar la selección. Revisa el almacenamiento del navegador.");
      return;
    }
    window.dispatchEvent(new Event(PARFUMS_CART_UPDATED_EVENT));
    onNotice(`${product.brand} ${product.name} · ${decant.size} ml añadido`);
  }

  return (
    <section className={styles.results} data-finder-results aria-labelledby="finder-title" tabIndex={-1} id="recomendacion">
      <p className={styles.resultEyebrow}>Tu selección Cruzial</p>
      <h2 id="finder-title">{heading}</h2>
      <p className={styles.resultIntro}>{intro}</p>
      <p className={styles.methodNote}>La afinidad no mide rendimiento ni garantiza que una fragancia te guste; organiza coincidencias entre tus respuestas y el catálogo.</p>
      <div className={styles.resultList}>
        {results.map((result, index) => {
          const decant = smallestOrderableDecant(result.product);
          const decantSizes = Object.keys(result.product.decantPrices)
            .map(Number)
            .sort((a, b) => a - b);
          return (
            <article className={`${styles.resultCard} ${index === 0 ? styles.topResult : ""}`} key={result.product.legacyId}>
              <Link className={styles.resultMedia} href={`/parfums/productos/${result.product.slug}` as Route}>
                {result.product.imageUrl ? <Image src={result.product.imageUrl} alt={result.product.imageAlt} fill sizes="96px" className={styles.resultImage} /> : null}
              </Link>
              <div className={styles.resultBody}>
                <span className={styles.score}>{finderScoreLabel(result.score)} <em>{result.score}/100</em></span>
                <span className={styles.resultBrand}>{result.product.brand}</span>
                <h3><Link href={`/parfums/productos/${result.product.slug}` as Route}>{result.product.name}</Link></h3>
                <p>{finderWhyText(result.reasons)}</p>
                <div className={styles.resultActions}>
                  <Link href={`/parfums/productos/${result.product.slug}` as Route}>Ver perfume</Link>
                  {decant ? (
                    <button type="button" onClick={() => add(result.product)}>
                      Probar {decant.size} ml <span aria-hidden="true">+</span>
                    </button>
                  ) : null}
                </div>
                {decantSizes.length > 0 ? (
                  <small>
                    Decants desde {money(Math.min(...Object.values(result.product.decantPrices)))} · {decantSizes.join(" / ")} ml
                  </small>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      <div className={styles.resultFooter}>
        <Link href={redoHref} data-finder-restart>Cambiar mis respuestas</Link>
        <button type="button" onClick={onClear}>Quitar recomendación</button>
      </div>
    </section>
  );
}
