"use client";

import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import styles from "./product-marquee.module.css";

export type MarqueeItem = {
  id: string;
  href: string;
  image: string | null;
  alt: string;
  kicker?: string | null;
  title: string;
  meta?: string | null;
};

type ProductMarqueeProps = {
  /** Section heading, rendered on the left of the control row. */
  heading: ReactNode;
  /** Accessible name of the scrollable product list. */
  label: string;
  items: readonly MarqueeItem[];
  /** Visual personality; the structure and behaviour are shared. */
  tone: "parfums" | "import";
};

// Below this the strip is a calm static row: duplicating two products to fake
// an endless loop reads as a bug, not as abundance.
const LOOP_MIN_ITEMS = 5;
const DRIFT_PX_PER_SECOND = 26;
const RESUME_DELAY_MS = 900;

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

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="3.5" y="3" width="3" height="10" rx="0.6" />
      <rect x="9.5" y="3" width="3" height="10" rx="0.6" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M4.5 3v10l8-5-8-5Z" />
    </svg>
  );
}

function Card({ item, hidden = false }: { item: MarqueeItem; hidden?: boolean }) {
  return (
    <li className={styles.item}>
      <Link
        href={item.href as Route}
        className={styles.card}
        tabIndex={hidden ? -1 : undefined}
        data-marquee-card
      >
        <span className={styles.media}>
          {item.image ? (
            <Image
              src={item.image}
              alt={hidden ? "" : item.alt}
              fill
              sizes="(max-width: 767px) 62vw, (max-width: 1199px) 30vw, 270px"
              className={styles.image}
              loading="lazy"
            />
          ) : null}
        </span>
        <span className={styles.body}>
          {item.kicker ? <span className={styles.kicker}>{item.kicker}</span> : null}
          <strong className={styles.title}>{item.title}</strong>
          {item.meta ? <span className={styles.meta}>{item.meta}</span> : null}
        </span>
      </Link>
    </li>
  );
}

/**
 * Discovery rail shared by both storefronts. It drifts slowly on its own,
 * but the viewport is a real scroll container: pointer, touch, wheel, focus,
 * the arrows and the pause button all take control immediately and the drift
 * only resumes after a pause. With reduced motion (or too few products to
 * loop honestly) it never moves by itself.
 */
export function ProductMarquee({ heading, label, items, tone }: ProductMarqueeProps) {
  const reducedMotion = usePrefersReducedMotion();
  const loop = items.length >= LOOP_MIN_ITEMS;
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointerInsideRef = useRef(false);
  const keyboardFocusRef = useRef(false);
  const resumeAtRef = useRef(0);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(false);

  const running = loop && !reducedMotion && !paused && inView;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !loop) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(Boolean(entry?.isIntersecting)),
      { threshold: 0.15 },
    );
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [loop]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!running || !viewport) return undefined;
    let frame = 0;
    let last = performance.now();
    let position = viewport.scrollLeft;

    const tick = (now: number) => {
      const elapsed = Math.min(now - last, 64);
      last = now;
      if (pointerInsideRef.current || keyboardFocusRef.current || now < resumeAtRef.current || document.hidden) {
        position = viewport.scrollLeft;
      } else {
        const half = viewport.scrollWidth / 2;
        position += (DRIFT_PX_PER_SECOND * elapsed) / 1000;
        if (position >= half) position -= half;
        viewport.scrollLeft = position;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  const holdFor = useCallback(() => {
    resumeAtRef.current = performance.now() + RESUME_DELAY_MS;
  }, []);

  const handleScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !loop) return;
    const half = viewport.scrollWidth / 2;
    if (viewport.scrollLeft >= half) viewport.scrollLeft -= half;
  }, [loop]);

  const scrollByCard = useCallback(
    (direction: 1 | -1) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const card = viewport.querySelector<HTMLElement>("[data-marquee-card]");
      const step = (card?.offsetWidth ?? viewport.clientWidth * 0.7) + 18;
      holdFor();
      viewport.scrollBy({ left: step * direction, behavior: reducedMotion ? "auto" : "smooth" });
    },
    [holdFor, reducedMotion],
  );

  if (items.length === 0) return null;

  return (
    <div
      className={`${styles.root} ${styles[tone]}`}
      data-product-marquee
      // Keyboard focus pauses the rail until focus leaves; pointer focus does
      // not trap the animation after the visitor moves away.
      onFocusCapture={() => {
        const active = document.activeElement;
        keyboardFocusRef.current = active instanceof HTMLElement && active.matches(":focus-visible");
      }}
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        keyboardFocusRef.current =
          next instanceof HTMLElement && event.currentTarget.contains(next) && next.matches(":focus-visible");
      }}
    >
      <div className={styles.head}>
        <div className={styles.heading}>{heading}</div>
        <div className={styles.controls}>
          {loop && !reducedMotion ? (
            <button
              type="button"
              className={styles.control}
              onClick={() => setPaused((value) => !value)}
              aria-pressed={paused}
              aria-label={paused ? "Reanudar el movimiento automático" : "Pausar el movimiento automático"}
            >
              {paused ? <PlayIcon /> : <PauseIcon />}
            </button>
          ) : null}
          {loop ? (
            <>
              <button type="button" className={`${styles.control} ${styles.arrow}`} onClick={() => scrollByCard(-1)} aria-label="Ver anteriores">
                <span aria-hidden="true">←</span>
              </button>
              <button type="button" className={`${styles.control} ${styles.arrow}`} onClick={() => scrollByCard(1)} aria-label="Ver siguientes">
                <span aria-hidden="true">→</span>
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div
        ref={viewportRef}
        className={styles.viewport}
        role="region"
        aria-label={label}
        data-loop={loop || undefined}
        onScroll={handleScroll}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") pointerInsideRef.current = true;
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") pointerInsideRef.current = false;
        }}
        onPointerDown={holdFor}
        onTouchStart={holdFor}
        onWheel={holdFor}
      >
        <div className={styles.track}>
          <ul className={styles.list}>
            {items.map((item) => (
              <Card key={item.id} item={item} />
            ))}
          </ul>
          {loop ? (
            <ul className={styles.list} aria-hidden="true" inert>
              {items.map((item) => (
                <Card key={item.id} item={item} hidden />
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
