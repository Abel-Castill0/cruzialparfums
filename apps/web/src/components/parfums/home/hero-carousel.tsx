import { getImageProps } from "next/image";
import { ContentLink } from "@/components/storefront/content-link";
import styles from "./hero-carousel.module.css";

/*
 * Hero of /parfums: one image per screen, both pure crops of the same original (hero-crop.webp, 1672x792), plus one visible
 * action ("Explorar catalogo") and a visually hidden h1. Nothing is composed, blended or synthesized (docs/hero-variants.md §15).
 * - 768px and up: a 21:9 crop (x 95-1672, y 88-764): all six bottles and the baked wordmark.
 * - Phones: a 3:2 crop (x 100-1300, y 0-792, full height): the complete wordmark and monogram, Tom Ford, Erba Pura, Valentino and
 *   Sauvage, with the smoke around them. A 4:5 window of this image can hold the wordmark or the bottles, never both (the
 *   wordmark sits between the two groups), so the phone crop is the narrowest window that keeps both.
 * Only /parfums uses this component; Import has its own hero.
 */
const DESKTOP_ART = { src: "/parfums/hero/hero-wide-21x9.webp", width: 1577, height: 676 } as const;
const PHONE_ART = { src: "/parfums/hero/hero-mobile-3x2.webp", width: 1200, height: 792 } as const;
const DESKTOP_MEDIA = "(min-width: 768px)";
// The exact complement of DESKTOP_MEDIA, so each preload fetches only the asset its screen shows.
const PHONE_MEDIA = "(max-width: 767px)";

export function HeroArtwork({
  title,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  // The hero image is the LCP element on every screen: eager + high priority + a preload, never lazy.
  const shared = { alt: "Cruzial Perfumería", quality: 70, fetchPriority: "high" as const, loading: "eager" as const, sizes: "100vw" };
  const { props: desktop } = getImageProps({ ...shared, ...DESKTOP_ART });
  const { props: phone } = getImageProps({ ...shared, ...PHONE_ART });
  const { srcSet: desktopSet } = desktop;
  const { srcSet: phoneSet, ...img } = phone;
  return (
    <>
      {/* React hoists these to <head>; `media` keeps the other screen's asset from being downloaded. */}
      <link rel="preload" as="image" media={PHONE_MEDIA} imageSrcSet={phoneSet} imageSizes="100vw" fetchPriority="high" />
      <link rel="preload" as="image" media={DESKTOP_MEDIA} imageSrcSet={desktopSet} imageSizes="100vw" fetchPriority="high" />
      <section className={styles.hero} data-home-hero aria-label="Cruzial Parfums">
        <picture className={styles.art}>
          <source media={DESKTOP_MEDIA} srcSet={desktopSet} />
          <img {...img} src={phone.src} srcSet={phoneSet} alt={shared.alt} className={styles.image} />
        </picture>
        <div className={styles.foot}>
          <h1 className={styles.title}>{title}</h1>
          <div className={styles.actions}>
            <ContentLink href={ctaHref} className={styles.cta}>
              {ctaLabel}
            </ContentLink>
          </div>
        </div>
      </section>
    </>
  );
}
