import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./hero-carousel.module.css";

/** One editorial artwork, with the navigation cue kept outside the image. */
export function HeroArtwork({
  src,
  alt,
  position,
  mobilePosition,
  mobileFit,
  ctaHref,
  ctaLabel,
}: {
  src: string;
  alt: string;
  position: string;
  mobilePosition: string;
  mobileFit?: "wordmark";
  ctaHref: Route;
  ctaLabel: string;
}) {
  return (
    <section className={styles.hero} data-home-hero data-fit={mobileFit} aria-label="Cruzial Parfums">
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 767px) 330vw, 100vw"
        className={styles.image}
        style={{ "--pos": position, "--pos-mobile": mobilePosition } as React.CSSProperties}
        preload
      />
      <div className={styles.shade} aria-hidden="true" />
      <div className={styles.bar}>
        <Link href={ctaHref} className={styles.cta}>
          {ctaLabel} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}
