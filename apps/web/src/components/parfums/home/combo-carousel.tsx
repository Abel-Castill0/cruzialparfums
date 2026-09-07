"use client";

import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { minimumPrice } from "@/domains/catalog/catalog-query";
import type { CatalogProduct } from "@/domains/catalog/types";
import styles from "./combo-carousel.module.css";

const AUTOPLAY_MS = 4800;

function money(value: number) {
  return `S/ ${value.toFixed(2)}`;
}

function subscribeReducedMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot, () => false);
}

export function ComboCarousel({ combos }: { combos: CatalogProduct[] }) {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  const count = combos.length;
  const canAutoplay = count > 1 && !reducedMotion && !hovered && !focused && !interacted && !tabHidden;

  useEffect(() => {
    function handleVisibility() {
      setTabHidden(document.hidden);
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    if (!canAutoplay) return undefined;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [canAutoplay, count]);

  const goTo = useCallback(
    (next: number, manual: boolean) => {
      setIndex(((next % count) + count) % count);
      if (manual) setInteracted(true);
    },
    [count],
  );

  function handleTouchStart(event: React.TouchEvent) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const deltaX = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(deltaX) < 40) return;
    goTo(deltaX < 0 ? index + 1 : index - 1, true);
  }

  if (count === 0) return null;

  return (
    <div
      className={styles.carousel}
      role="region"
      aria-roledescription="carousel"
      aria-label="Combos Cruzial"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <div
        ref={trackRef}
        className={styles.track}
        style={{ transform: `translateX(-${index * 100}%)` }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {combos.map((combo, slideIndex) => {
          const content = combo.comboContent;
          const startingPrice = minimumPrice(combo.decantPrices);
          return (
            <article
              key={combo.legacyId}
              className={styles.slide}
              aria-hidden={slideIndex !== index}
              data-active={slideIndex === index}
            >
              {content?.heroImageUrl ? (
                <Image
                  src={content.heroImageUrl}
                  alt={combo.name}
                  fill
                  sizes="(max-width: 767px) 100vw, 1200px"
                  className={styles.slideImage}
                  loading="lazy"
                />
              ) : null}
              <div className={styles.scrim} aria-hidden="true" />
              <div className={styles.slideCopy}>
                <p className={styles.eyebrow}>Combo Cruzial</p>
                <h3>{combo.name}</h3>
                <p className={styles.contents}>{content?.perfumes.join(" · ")}</p>
                <div className={styles.slideActions}>
                  <span className={styles.price}>Desde {money(startingPrice)}</span>
                  <Link
                    href={`/parfums/combos#${combo.slug}` as Route}
                    className={styles.cta}
                    tabIndex={slideIndex === index ? 0 : -1}
                  >
                    Ver combo <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {count > 1 ? (
        <>
          <button
            type="button"
            className={`${styles.arrow} ${styles.arrowPrev}`}
            onClick={() => goTo(index - 1, true)}
            aria-label="Combo anterior"
          >
            ←
          </button>
          <button
            type="button"
            className={`${styles.arrow} ${styles.arrowNext}`}
            onClick={() => goTo(index + 1, true)}
            aria-label="Siguiente combo"
          >
            →
          </button>
          <div className={styles.dots} role="tablist" aria-label="Selecciona un combo">
            {combos.map((combo, dotIndex) => (
              <button
                key={combo.legacyId}
                type="button"
                role="tab"
                aria-selected={dotIndex === index}
                aria-label={`Ir a ${combo.name}`}
                className={`${styles.dot} ${dotIndex === index ? styles.dotActive : ""}`}
                onClick={() => goTo(dotIndex, true)}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
