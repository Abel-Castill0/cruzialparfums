"use client";

import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { minimumPrice } from "@/domains/catalog/catalog-query";
import type { CatalogProduct } from "@/domains/catalog/types";
import type { ComboMemberPhoto } from "@/domains/combos/combo-builder";
import { COMBO_ART, COMBO_SET_ART } from "@/components/parfums/shared/combo-art";
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

export function ComboCarousel({ combos, photosBySlug = {} }: { combos: CatalogProduct[]; photosBySlug?: Record<string, ComboMemberPhoto[]> }) {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [paused, setPaused] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  const count = combos.length;
  const canAutoplay = count > 1 && !reducedMotion && !hovered && !focused && !paused && !tabHidden;

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
      if (manual) setPaused(true);
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
          const setArt = COMBO_SET_ART[combo.slug];
          const startingPrice = minimumPrice(combo.decantPrices);
          const art = setArt ?? (content?.heroImageUrl ? undefined : COMBO_ART[combo.slug]);
          const memberPhotos = content?.heroImageUrl || art ? [] : (photosBySlug[combo.slug] ?? []);
          return (
            <article
              key={combo.legacyId}
              className={styles.slide}
              aria-hidden={slideIndex !== index}
              data-active={slideIndex === index}
            >
              <div className={styles.slideMedia} aria-hidden="true">
                {content?.heroImageUrl && !setArt ? (
                  <Image
                    src={content.heroImageUrl}
                    alt=""
                    fill
                    sizes="(max-width: 767px) 100vw, 1200px"
                    className={styles.slideImage}
                    loading="lazy"
                  />
                ) : art ? (
                  <Image
                    src={art.src}
                    alt=""
                    fill
                    sizes="(max-width: 767px) 100vw, 1200px"
                    className={styles.slideImage}
                    style={{ "--pos": art.position, "--pos-mobile": art.mobilePosition } as React.CSSProperties}
                    loading="lazy"
                  />
                ) : memberPhotos.length ? (
                  <div className={styles.slidePhotos} style={{ "--count": memberPhotos.length } as React.CSSProperties}>
                    {memberPhotos.map((photo) => (
                      <span key={photo.id} className={styles.slidePhoto}>
                        <Image src={photo.url} alt="" fill sizes="(max-width: 640px) 22vw, 12vw" className={styles.slidePhotoImage} loading="lazy" />
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
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
          {!reducedMotion ? (
            <button
              type="button"
              className={styles.pause}
              onClick={() => setPaused((value) => !value)}
              aria-pressed={paused}
              aria-label={paused ? "Reanudar la rotación automática de combos" : "Pausar la rotación automática de combos"}
            >
              <span aria-hidden="true">{paused ? "▶" : "❚❚"}</span>
            </button>
          ) : null}
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
