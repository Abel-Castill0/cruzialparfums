import Image from "next/image";
import Link from "next/link";
import styles from "./page.module.css";

/**
 * Gateway: two doors and nothing else. The only furniture is a transparent
 * bar with the wordmark and the seam between the two worlds.
 */
export default function Home() {
  return (
    <main className={styles.page} aria-label="Elige tu tienda Cruzial">
      <h1 className={styles.srOnly}>Cruzial: elige entre Parfums e Import</h1>
      <p className={styles.wordmark} aria-hidden="true">Cruzial</p>
      <span className={styles.seam} aria-hidden="true" />

      <Link
        className={styles.world}
        data-unit="parfums"
        href="/parfums"
        aria-label="Entrar a Cruzial Parfums"
      >
        <span className={`${styles.visual} ${styles.parfumsVisual}`} aria-hidden="true">
          <Image
            src="/images/home-redesign/home-hero-perfume.webp"
            alt=""
            fill
            priority
            sizes="(max-width: 700px) 100vw, 50vw"
            className={styles.parfumsImage}
          />
        </span>
        <span className={styles.copy}>
          <span className={styles.label}>Parfums</span>
          <span className={styles.line}>Decants, frascos y combos de perfumería árabe, designer y nicho.</span>
          <span className={styles.enter}>
            <span className={styles.enterText}>Entrar</span>
            <span className={styles.arrow} aria-hidden="true">↗</span>
          </span>
        </span>
      </Link>

      <Link
        className={styles.world}
        data-unit="import"
        href="/import"
        aria-label="Entrar a Cruzial Import"
      >
        <span className={`${styles.visual} ${styles.importVisual}`} aria-hidden="true">
          <Image
            src="/images/import-home/import-hero-container.webp"
            alt=""
            fill
            priority
            sizes="(max-width: 700px) 100vw, 50vw"
            className={styles.importImage}
          />
        </span>
        <span className={styles.copy}>
          <span className={styles.label}>Import</span>
          <span className={styles.line}>Consolidados de perfumería: compra grupal por campaña.</span>
          <span className={styles.enter}>
            <span className={styles.enterText}>Entrar</span>
            <span className={styles.arrow} aria-hidden="true">↗</span>
          </span>
        </span>
      </Link>
    </main>
  );
}
