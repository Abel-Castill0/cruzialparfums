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
  variant,
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
  /** Design experiment on claude/hero-variants only: a | b | c. Undefined = the shipped hero. */
  variant?: "a" | "b" | "c" | undefined;
}) {
  return (
    <section className={styles.hero} data-home-hero data-fit={mobileFit} data-variant={variant} aria-label="Cruzial Parfums">
      <Image
        src={src}
        alt={alt}
        fill
        // Phones draw the artwork at 250% of the viewport width (see hero-carousel.module.css).
        sizes="(max-width: 767px) 250vw, 100vw"
        className={styles.image}
        style={{ "--pos": position, "--pos-mobile": mobilePosition } as React.CSSProperties}
        preload
        fetchPriority="high"
        quality={60}
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
