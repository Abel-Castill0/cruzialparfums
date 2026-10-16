"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { useEffect, useRef } from "react";
import { lightboxActionForKey } from "./lightbox-state";
import styles from "./lightbox.module.css";

export type LightboxImage = { src: string; alt: string };

export function Lightbox({ images, index, onClose, onChangeIndex }: {
  images: LightboxImage[];
  index: number;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const current = useRef({ index, onClose, onChangeIndex });

  useEffect(() => {
    current.current = { index, onClose, onChangeIndex };
  }, [index, onChangeIndex, onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      const action = lightboxActionForKey(event.key);
      if (action === "close") {
        event.preventDefault();
        current.current.onClose();
      } else if (action === "previous") {
        event.preventDefault();
        current.current.onChangeIndex((current.current.index - 1 + images.length) % images.length);
      } else if (action === "next") {
        event.preventDefault();
        current.current.onChangeIndex((current.current.index + 1) % images.length);
      } else if (event.key === "Tab") {
        const controls = dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])");
        if (!controls?.length) return;
        const first = controls.item(0);
        const last = controls.item(controls.length - 1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [images.length]);

  if (typeof document === "undefined" || images.length === 0) return null;
  const image = images[index];
  if (!image) return null;

  return createPortal(
    <div data-lightbox-backdrop className={styles.backdrop} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-label="Galería de fotos">
        <button ref={closeButtonRef} className={styles.close} type="button" onClick={onClose} aria-label="Cerrar galería">×</button>
        {images.length > 1 ? (
          <>
            <button className={`${styles.navigation} ${styles.previous}`} type="button" onClick={() => onChangeIndex((index - 1 + images.length) % images.length)} aria-label="Foto anterior">‹</button>
            <button className={`${styles.navigation} ${styles.next}`} type="button" onClick={() => onChangeIndex((index + 1) % images.length)} aria-label="Foto siguiente">›</button>
          </>
        ) : null}
        <div className={styles.imageFrame}>
          <Image src={image.src} alt={image.alt} fill sizes="92vw" priority />
        </div>
        <p className={styles.caption} aria-live="polite">{image.alt} <span>{index + 1} / {images.length}</span></p>
      </div>
    </div>,
    document.body,
  );
}
