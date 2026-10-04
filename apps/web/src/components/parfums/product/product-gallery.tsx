"use client";

import Image from "next/image";
import { useMemo, useRef, useState, type KeyboardEvent, type TouchEvent } from "react";
import type { CatalogProduct } from "@/domains/catalog/types";
import styles from "./product-gallery.module.css";

export type GalleryImage = { url: string; alt: string };

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
 */
export function useProductGallery(images: GalleryImage[], preferredUrl: string | null) {
  const urls = useMemo(() => images.map((image) => image.url), [images]);
  const [chosen, setChosen] = useState<{ url: string; preferred: string | null } | null>(null);

  // A new preferred photo (presentation changed) overrides an earlier manual pick.
  const active = chosen && chosen.preferred === preferredUrl && urls.includes(chosen.url)
    ? chosen.url
    : preferredUrl && urls.includes(preferredUrl) ? preferredUrl : urls[0] ?? null;
  const index = active ? urls.indexOf(active) : -1;

  function go(next: number) {
    if (urls.length < 2) return;
    const wrapped = (next + urls.length) % urls.length;
    setChosen({ url: urls[wrapped]!, preferred: preferredUrl });
  }

  return { active, index, count: urls.length, go };
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
