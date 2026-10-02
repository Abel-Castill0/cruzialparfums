import Image from "next/image";
import { CRUZIAL_TIKTOK_PROFILE } from "@/domains/platform/home-video";
import styles from "./tiktok-profile.module.css";

/**
 * TikTok module for a unit that has no video of its own: an honest door to
 * the official profile. It states only what is verifiable (the account and
 * where it lives) and never presents another unit's video as its own.
 */
export function TikTokProfile({ eyebrow, title, text, posterSrc, posterAlt, tone }: {
  eyebrow: string;
  title: string;
  text: string;
  posterSrc: string;
  posterAlt: string;
  tone: "parfums" | "import";
}) {
  return (
    <section className={`${styles.profile} ${styles[tone]}`} aria-labelledby="tiktok-profile-title">
      <div className={styles.inner}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h2 id="tiktok-profile-title">{title}</h2>
          <p>{text}</p>
          <a
            href={CRUZIAL_TIKTOK_PROFILE.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.action}
          >
            Ver {CRUZIAL_TIKTOK_PROFILE.handle} en TikTok <span aria-hidden="true">↗</span>
          </a>
        </div>
        <div className={styles.card}>
          <Image src={posterSrc} alt={posterAlt} fill sizes="(max-width: 767px) 80vw, 340px" className={styles.cardImage} loading="lazy" />
          <span className={styles.cardShade} aria-hidden="true" />
          <span className={styles.cardCopy}>
            <strong>{CRUZIAL_TIKTOK_PROFILE.name}</strong>
            <span>{CRUZIAL_TIKTOK_PROFILE.handle}</span>
          </span>
        </div>
      </div>
    </section>
  );
}
