import type { Route } from "next";
import Image, { getImageProps } from "next/image";
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
  /** Design experiment on claude/hero-variants only: a | b | c | d. Undefined = the shipped hero. */
  variant?: "a" | "b" | "c" | "d" | undefined;
}) {
  if (variant === "d") {
    return <HeroArtworkD alt={alt} title={title} ctaHref={ctaHref} ctaLabel={ctaLabel} secondaryHref={secondaryHref} secondaryLabel={secondaryLabel} />;
  }
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

/**
 * Variant D: the artwork is re-framed, not re-styled. Two assets cut from the same source (see
 * docs/hero-variants.md): a 21:9 crop for desktop and a 4:5 re-stack for phones. Both show every bottle and the
 * baked wordmark at scale 1.0 (the image is never zoomed or cropped by CSS), and the headline sits on the
 * ink strip under the art.
 */
const ART_D = {
  wide: { src: "/parfums/hero/hero-d-wide.webp", width: 1577, height: 676 },
  portrait: { src: "/parfums/hero/hero-d-portrait.webp", width: 1100, height: 1375 },
} as const;

/** Phones and portrait tablets get the 4:5 asset; landscape screens get the 21:9 one. Keep in sync with the CSS. */
const PORTRAIT_MEDIA = "(max-width: 767px), (max-width: 1100px) and (orientation: portrait)";

function HeroArtworkD({
  alt,
  title,
  ctaHref,
  ctaLabel,
  secondaryHref,
  secondaryLabel,
}: {
  alt: string;
  title: string;
  ctaHref: Route;
  ctaLabel: string;
  secondaryHref?: Route | undefined;
  secondaryLabel?: string | undefined;
}) {
  const shared = { alt, quality: 60, fetchPriority: "high" as const };
  const { props: wide } = getImageProps({ ...shared, ...ART_D.wide, sizes: "100vw" });
  const { props: portrait } = getImageProps({ ...shared, ...ART_D.portrait, sizes: "100vw" });
  const { srcSet: wideSet, ...img } = wide;
  return (
    <section className={styles.hero} data-home-hero data-variant="d" aria-label="Cruzial Parfums">
      <picture className={styles.artD}>
        <source media={PORTRAIT_MEDIA} srcSet={portrait.srcSet} />
        <source srcSet={wideSet} />
        <img {...img} alt={alt} className={styles.imageD} />
      </picture>
      <div className={styles.footD}>
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
