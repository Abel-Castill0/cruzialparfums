import type { Route } from "next";
import { getImageProps } from "next/image";
import Link from "next/link";
import styles from "./hero-carousel.module.css";

/*
 * Hero of /parfums (variant F, docs/hero-variants.md). Two sources, one headline, two actions:
 * - Desktop and landscape: a 21:9 crop of hero-crop.webp (x 95-1672, y 88-764). Pure crop: all six bottles and the
 *   baked wordmark, no synthesized pixels. The headline sits on the ink strip below the art.
 * - Phones and portrait tablets: no product image. The official lockup (logo.jpeg, byte-identical, 499x494, near-black
 *   ground) shows its "CRUZIAL / PERFUMERIA" window on a solid --ds-color-navy hero. Nothing is keyed, blended or edited.
 * Only /parfums uses this component; Import has its own hero.
 */
const DESKTOP_ART = { src: "/parfums/hero/hero-wide-21x9.webp", width: 1577, height: 676 } as const;
const PHONE_LOGO = { src: "/parfums/hero/logo-official.jpeg", width: 499, height: 494 } as const;
const PHONE_MEDIA = "(max-width: 767px), (max-width: 1100px) and (orientation: portrait)";

export function HeroArtwork({
  title,
  ctaHref,
  ctaLabel,
  secondaryHref,
  secondaryLabel,
}: {
  title: string;
  ctaHref: Route;
  ctaLabel: string;
  secondaryHref?: Route | undefined;
  secondaryLabel?: string | undefined;
}) {
  const shared = { alt: "Cruzial Perfumería", quality: 60, fetchPriority: "high" as const };
  const { props: desktop } = getImageProps({ ...shared, ...DESKTOP_ART, sizes: "100vw" });
  // The official logo is served byte for byte: the optimizer would recompress it.
  const { props: phone } = getImageProps({ ...shared, ...PHONE_LOGO, sizes: "280px", unoptimized: true });
  const { srcSet: desktopSet, ...img } = desktop;
  return (
    <section className={styles.hero} data-home-hero aria-label="Cruzial Parfums">
      <picture className={styles.art}>
        <source media={PHONE_MEDIA} srcSet={phone.srcSet ?? phone.src} />
        <source srcSet={desktopSet} />
        <img {...img} alt={shared.alt} className={styles.image} />
      </picture>
      <div className={styles.foot}>
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
