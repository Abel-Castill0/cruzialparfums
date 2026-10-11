import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./hero-carousel.module.css";

/** One cinematic artwork with the page headline and two calls to action over it. */
export function HeroArtwork({
  src,
  alt,
  position,
  mobilePosition,
  mobileFit,
  title,
  ctaHref,
  ctaLabel,
  secondaryHref,
  secondaryLabel,
}: {
  src: string;
  alt: string;
  position: string;
  mobilePosition: string;
  mobileFit?: "wordmark";
  title: string;
  ctaHref: Route;
  ctaLabel: string;
  secondaryHref?: Route;
  secondaryLabel?: string;
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
        fetchPriority="high"
      />
      <div className={styles.shade} aria-hidden="true" />
      <div className={styles.content}>
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.actions}>
          <Link href={ctaHref} className={styles.cta}>
            {ctaLabel}
          </Link>
          {secondaryHref && secondaryLabel ? (
            <Link href={secondaryHref} className={styles.ctaSecondary}>
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
