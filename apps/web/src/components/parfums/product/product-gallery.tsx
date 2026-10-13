"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type TouchEvent } from "react";
import type { CatalogProduct } from "@/domains/catalog/types";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import styles from "./product-gallery.module.css";

export type GalleryImage = { url: string; alt: string };

/** How long each photo stays on stage before the gallery moves on by itself. Code-level setting, not an admin option. */
export const GALLERY_ROTATION_MS = 5000;

/**
 * Whether the gallery should be counting down to the next photo. Needs two photos or more, motion allowed, and neither
 * the visitor having taken over (`stopped`) nor the pointer/focus being on the stage (`holding`).
 */
export function isGalleryRotating(state: { count: number; reducedMotion: boolean; stopped: boolean; holding: boolean }): boolean {
  return state.count > 1 && !state.reducedMotion && !state.stopped && !state.holding;
}

/** The photo after `index`, wrapping around. */
export function nextGalleryIndex(index: number, count: number): number {
  return count > 0 ? (index + 1) % count : 0;
}

/**
 * Every public photo of a product, in the order the admin arranged them
 * (primary first). A product from the legacy fixture has a single photo; one
 * with no photo yields an empty list and the page shows its neutral fallback.
 */
export function galleryImages(product: CatalogProduct, fallbackUrl: string | null): GalleryImage[] {
  const seen = new Set<string>();
  const images: GalleryImage[] = [];
  const base = [product.brand, product.name].filter(Boolean).join(" ");
  const add = (url: string | null | undefined, alt: string | undefined) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    images.push({ url, alt: alt?.trim() || base });
  };
  for (const item of product.media) add(item.url, item.alt);
  add(fallbackUrl, product.imageAlt);
  return images;
}

/**
 * Which photo is on stage. Changing the presentation (decant / bottle) brings
 * its own photo forward when the product has one; the customer's own choice of
 * a thumbnail is kept until then.
 *
 * With two or more photos the gallery advances every GALLERY_ROTATION_MS. It never moves under reduced motion; it waits
 * while the pointer or keyboard focus is on the stage; and the first time the visitor takes over (arrows, thumbnails,
 * swipe, keys) or presses the pause control it stops for good, so the photo they chose stays put (WCAG 2.2.2).
 */
export function useProductGallery(images: GalleryImage[], preferredUrl: string | null) {
  const urls = useMemo(() => images.map((image) => image.url), [images]);
  const [chosen, setChosen] = useState<{ url: string; preferred: string | null } | null>(null);

  // A new preferred photo (presentation changed) overrides an earlier manual pick.
  const active = chosen && chosen.preferred === preferredUrl && urls.includes(chosen.url)
    ? chosen.url
    : preferredUrl && urls.includes(preferredUrl) ? preferredUrl : urls[0] ?? null;
  const index = active ? urls.indexOf(active) : -1;

  const reducedMotion = usePrefersReducedMotion();
  const [stopped, setStopped] = useState(false);
  const [holding, setHolding] = useState(false);
  const canRotate = urls.length > 1 && !reducedMotion;
  const running = isGalleryRotating({ count: urls.length, reducedMotion, stopped, holding });

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setTimeout(() => {
      setChosen({ url: urls[nextGalleryIndex(index, urls.length)]!, preferred: preferredUrl });
    }, GALLERY_ROTATION_MS);
    // A new photo (automatic or chosen) restarts the countdown.
    return () => window.clearTimeout(timer);
  }, [running, index, urls, preferredUrl]);

  function go(next: number) {
    if (urls.length < 2) return;
    const wrapped = (next + urls.length) % urls.length;
    setStopped(true);
    setChosen({ url: urls[wrapped]!, preferred: preferredUrl });
  }

  const rotation = {
    /** The gallery can rotate at all (two photos or more, motion allowed). */
    available: canRotate,
    /** The visitor has not stopped it: false after a manual move or the pause control. */
    enabled: canRotate && !stopped,
    toggle: () => setStopped((value) => !value),
    /** Spread on the stage: the countdown waits while the pointer or focus is on it. */
    hold: {
      onMouseEnter: () => setHolding(true),
      onMouseLeave: () => setHolding(false),
      onFocus: () => setHolding(true),
      onBlur: (event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHolding(false);
      },
    },
  };

  return { active, index, count: urls.length, go, rotation };
}

export function GalleryRotationToggle({ rotation }: { rotation: ReturnType<typeof useProductGallery>["rotation"] }) {
  if (!rotation.available) return null;
  const label = rotation.enabled ? "Pausar el cambio automático de fotos" : "Reanudar el cambio automático de fotos";
  return (
    <button type="button" className={styles.rotationToggle} onClick={rotation.toggle} aria-label={label} aria-pressed={!rotation.enabled} data-gallery-rotation>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        {rotation.enabled ? (
          <>
            <rect x="3.5" y="3" width="3" height="10" rx="0.6" />
            <rect x="9.5" y="3" width="3" height="10" rx="0.6" />
          </>
        ) : (
          <path d="M4.5 3v10l8-5-8-5Z" />
        )}
      </svg>
    </button>
  );
}

export function GalleryArrows({
  index,
  count,
  go,
}: {
  index: number;
  count: number;
  go: (next: number) => void;
}) {
  if (count < 2) return null;
  return (
    <>
      <button type="button" className={`${styles.arrow} ${styles.arrowPrev}`} onClick={() => go(index - 1)} aria-label="Foto anterior" data-gallery-prev>
        <span aria-hidden="true">‹</span>
      </button>
      <button type="button" className={`${styles.arrow} ${styles.arrowNext}`} onClick={() => go(index + 1)} aria-label="Foto siguiente" data-gallery-next>
        <span aria-hidden="true">›</span>
      </button>
      <span className={styles.counter} aria-live="polite">{index + 1} / {count}</span>
    </>
  );
}

export function GalleryThumbs({
  images,
  index,
  go,
}: {
  images: GalleryImage[];
  index: number;
  go: (next: number) => void;
}) {
  if (images.length < 2) return null;
  return (
    <ul className={styles.thumbs} aria-label="Fotos del producto" data-gallery-thumbs>
      {images.map((image, position) => (
        <li key={image.url}>
          <button
            type="button"
            className={styles.thumb}
            aria-label={`Ver foto ${position + 1} de ${images.length}`}
            aria-current={position === index ? "true" : undefined}
            onClick={() => go(position)}
          >
            <Image src={image.url} alt="" width={96} height={96} sizes="72px" className={styles.thumbImage} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Left/right arrow keys and a horizontal swipe move through the photos. */
export function useGallerySwipe(index: number, count: number, go: (next: number) => void) {
  const startX = useRef<number | null>(null);
  return {
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      if (count < 2) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); go(index - 1); }
      if (event.key === "ArrowRight") { event.preventDefault(); go(index + 1); }
    },
    onTouchStart(event: TouchEvent<HTMLElement>) {
      startX.current = event.touches[0]?.clientX ?? null;
    },
    onTouchEnd(event: TouchEvent<HTMLElement>) {
      const from = startX.current;
      startX.current = null;
      if (from === null || count < 2) return;
      const delta = (event.changedTouches[0]?.clientX ?? from) - from;
      if (Math.abs(delta) > 48) go(delta < 0 ? index + 1 : index - 1);
    },
  };
}
