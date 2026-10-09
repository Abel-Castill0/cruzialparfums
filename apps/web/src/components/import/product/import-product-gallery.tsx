"use client";

import Image from "next/image";
import type { ImportGalleryPhoto } from "@/domains/import/public-import";
import {
  GalleryArrows,
  GalleryThumbs,
  useGallerySwipe,
  useProductGallery,
} from "@/components/parfums/product/product-gallery";

/**
 * Import product photos: the same stage/arrows/thumbnails/keyboard/swipe behaviour as Parfums, primary
 * photo first. A product with one photo (or only the neutral fallback) shows no gallery controls.
 */
export function ImportProductGallery({
  photos,
  name,
  frameClassName,
}: {
  photos: ImportGalleryPhoto[];
  name: string;
  frameClassName?: string | undefined;
}) {
  const gallery = useProductGallery(photos, null);
  const swipe = useGallerySwipe(gallery.index, gallery.count, gallery.go);
  const current = photos[gallery.index] ?? photos[0];

  return (
    <>
      <div
        className={frameClassName}
        data-product-stage
        tabIndex={gallery.count > 1 ? 0 : undefined}
        aria-label={gallery.count > 1 ? `Fotos de ${name}` : undefined}
        {...swipe}
      >
        {current ? (
          <Image
            key={current.url}
            src={current.url}
            alt={current.alt}
            fill
            loading="eager"
            sizes="(max-width: 767px) 100vw, 48vw"
          />
        ) : null}
        <GalleryArrows index={gallery.index} count={gallery.count} go={gallery.go} />
      </div>
      <GalleryThumbs images={photos} index={gallery.index} go={gallery.go} />
    </>
  );
}
