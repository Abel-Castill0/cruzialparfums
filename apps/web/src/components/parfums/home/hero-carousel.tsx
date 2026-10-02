"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SHOW_PARFUMS_HEADER_EVENT } from "@/components/parfums/shell/hero-aware-header";
import { MenuIcon } from "@/components/parfums/shell/shell-icons";
import styles from "./hero-carousel.module.css";

export type HeroSlide = {
  src: string;
  /** Describes the artwork itself; there is no text over the image. */
  alt: string;
  /** Where the subject sits on a wide screen. */
  position: string;
  /** Where the subject sits when the hero is a tall, narrow crop. */
  mobilePosition: string;
};

const SLIDE_MS = 8000;

function subscribeReducedMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/**
 * Editorial hero: artwork only. The first slide is the page's priority image;
 * the others are rendered after the page is idle so they never compete with
 * it. Rotation is slow and stops for hover, focus, touch, a hidden tab, an
 * off-screen hero, reduced motion, or when the visitor pauses it.
 */
export function HeroCarousel({ slides, ctaHref, ctaLabel }: {
  slides: readonly HeroSlide[];
  ctaHref: string;
  ctaLabel: string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const [rest, setRest] = useState(false);
  const [navShown, setNavShown] = useState(false);

  const count = slides.length;
  const playing = count > 1 && !reducedMotion && !paused && !engaged && !tabHidden && onScreen;

  useEffect(() => {
    const onVisibility = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(Boolean(entry?.isIntersecting)), { threshold: 0.35 });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  // Defer every slide after the first until the browser is idle.
  useEffect(() => {
    const schedule = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 1500));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = schedule(() => setRest(true));
    return () => cancel(handle as number);
  }, []);

  useEffect(() => {
    if (!playing || !rest) return undefined;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % count), SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [playing, rest, count]);

  const goTo = useCallback((next: number) => {
    setIndex(((next % count) + count) % count);
    setRest(true);
    // A deliberate choice ends automatic rotation until it is resumed.
    setPaused(true);
  }, [count]);

  const showNav = () => {
    setNavShown(true);
    window.dispatchEvent(new Event(SHOW_PARFUMS_HEADER_EVENT));
  };

  return (
    <section
      ref={rootRef}
      className={styles.hero}
      data-home-hero
      aria-roledescription="carousel"
      aria-label="Fragancias Cruzial Parfums"
      onPointerEnter={(event) => { if (event.pointerType === "mouse") setEngaged(true); }}
      onPointerLeave={(event) => { if (event.pointerType === "mouse") setEngaged(false); }}
      onFocusCapture={() => setEngaged(true)}
      onBlurCapture={() => setEngaged(false)}
    >
      <div className={styles.slides} aria-live={playing ? "off" : "polite"}>
        {slides.map((slide, slideIndex) => {
          if (slideIndex > 0 && !rest) return null;
          const active = slideIndex === index;
          return (
            <div
              key={slide.src}
              className={`${styles.slide} ${active ? styles.slideActive : ""}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${slideIndex + 1} de ${count}`}
              aria-hidden={!active}
              style={{ "--pos": slide.position, "--pos-mobile": slide.mobilePosition } as React.CSSProperties}
            >
              <Image
                src={slide.src}
                alt={active ? slide.alt : ""}
                fill
                sizes="(max-width: 767px) 330vw, 100vw"
                className={styles.image}
                {...(slideIndex === 0 ? { preload: true } : { loading: "lazy" as const })}
              />
            </div>
          );
        })}
      </div>
      <div className={styles.shade} aria-hidden="true" />

      {navShown ? null : (
        <button type="button" className={styles.navPeek} onClick={showNav} aria-label="Mostrar navegación">
          <MenuIcon />
        </button>
      )}

      <div className={styles.bar}>
        <Link href={ctaHref as never} className={styles.cta}>
          {ctaLabel} <span aria-hidden="true">→</span>
        </Link>
        {count > 1 ? (
          <div className={styles.controls}>
            {!reducedMotion ? (
              <button
                type="button"
                className={styles.control}
                onClick={() => setPaused((value) => !value)}
                aria-pressed={paused}
                aria-label={paused ? "Reanudar la rotación de imágenes" : "Pausar la rotación de imágenes"}
              >
                {paused ? (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4.5 3v10l8-5-8-5Z" /></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3.5" y="3" width="3" height="10" rx="0.6" /><rect x="9.5" y="3" width="3" height="10" rx="0.6" /></svg>
                )}
              </button>
            ) : null}
            <div className={styles.dots} role="group" aria-label="Elegir imagen">
              {slides.map((slide, dotIndex) => (
                <button
                  key={slide.src}
                  type="button"
                  className={`${styles.dot} ${dotIndex === index ? styles.dotActive : ""}`}
                  aria-label={`Mostrar imagen ${dotIndex + 1} de ${count}`}
                  aria-current={dotIndex === index}
                  onClick={() => goTo(dotIndex)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
