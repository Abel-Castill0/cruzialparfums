"use client";

import Image from "next/image";
import { useReducer } from "react";
import { Lightbox } from "@/components/ui/lightbox";
import { CLOSED_LIGHTBOX, lightboxReducer, type LightboxAction, type LightboxState } from "@/components/ui/lightbox-state";
import type { ProcessGalleryImage } from "./process-gallery-images";
import styles from "./process-gallery.module.css";

export function ProcessGallery({ images }: { images: ProcessGalleryImage[]; columns?: 2 | 3 | 4 }) {
  const [state, dispatch] = useReducer((current: LightboxState, action: LightboxAction) => lightboxReducer(current, action, images.length), CLOSED_LIGHTBOX);
  const handleClose = () => dispatch({ type: "close" });
  const handleIndexChange = (index: number) => dispatch({ type: "open", index });

  return (
    <>
      <ul className={styles.grid} data-process-gallery aria-label="Fotos de perfumes sellados">
        {images.map((image, index) => (
          <li key={image.src} className={styles.item}>
            <button className={styles.photo} type="button" onClick={() => dispatch({ type: "open", index })} aria-label={`Ampliar foto: ${image.alt}`}>
              <span className={styles.imageFrame} data-process-gallery-frame>
                <Image src={image.src} alt={image.alt} fill sizes="(max-width: 767px) 100vw, 38vw" loading={index === 0 ? "eager" : "lazy"} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {state.activeIndex !== null ? (
        <Lightbox
          images={images}
          index={state.activeIndex}
          onClose={handleClose}
          onChangeIndex={handleIndexChange}
        />
      ) : null}
    </>
  );
}
