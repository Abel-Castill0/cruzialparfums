"use client";

import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { minimumPrice } from "@/domains/catalog/catalog-query";
import type { CatalogProduct } from "@/domains/catalog/types";
import styles from "./featured-perfume-rail.module.css";

function money(value: number) {
  return `S/ ${value.toFixed(2)}`;
}

/**
 * "Selección Cruzial" — an editorial rail, not a sales claim. Renders
 * nothing when `products` is empty (no invented curation; see
 * LegacyCatalogRepository.listFeatured() and assets/data.js). Admin-
 * curatable via isFeatured/featuredRank/featuredFrom/featuredUntil.
 */
export function FeaturedPerfumeRail({ products }: { products: CatalogProduct[] }) {
  const trackRef = useRef<HTMLDivElement>(null);

  if (products.length === 0) return null;

  function scrollByCard(direction: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>("[data-rail-card]");
    const step = (card?.offsetWidth ?? track.clientWidth * 0.8) + 14;
    track.scrollBy({ left: step * direction, behavior: "smooth" });
  }

  return (
    <section className={styles.rail} aria-labelledby="featured-rail-title">
      <div className={styles.sectionHead}>
        <div>
          <p className={styles.eyebrow}>Selección Cruzial</p>
          <h2 id="featured-rail-title">Íconos de la <em>perfumería</em>.</h2>
        </div>
        <div className={styles.arrows}>
          <button type="button" onClick={() => scrollByCard(-1)} aria-label="Ver fragancia anterior">←</button>
          <button type="button" onClick={() => scrollByCard(1)} aria-label="Ver siguiente fragancia">→</button>
        </div>
      </div>
      <div className={styles.track} ref={trackRef} role="list">
        {products.map((product) => (
          <Link
            key={product.legacyId}
            href={`/parfums/productos/${product.slug}` as Route}
            className={styles.card}
            data-rail-card
            role="listitem"
          >
            <div className={styles.cardMedia}>
              {product.imageUrl ? (
                <Image
                  src={product.imageUrl}
                  alt={product.imageAlt}
                  fill
                  sizes="(max-width: 767px) 82vw, (max-width: 1199px) 34vw, 22vw"
                  className={styles.cardImage}
                  loading="lazy"
                />
              ) : null}
            </div>
            <div className={styles.cardBody}>
              <span className={styles.cardBrand}>{product.brand}</span>
              <strong className={styles.cardName}>{product.name}</strong>
              <span className={styles.cardPrice}>Desde {money(minimumPrice(product.decantPrices))}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
