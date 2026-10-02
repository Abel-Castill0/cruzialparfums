import Image from "next/image";
import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.page} aria-label="Elige tu tienda Cruzial">
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
        <span className={styles.action}>
          <span className={styles.label}>Parfums</span>
          <span className={styles.arrow} aria-hidden="true">↗</span>
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
            sizes="(max-width: 700px) 100vw, 50vw"
            className={styles.importImage}
          />
        </span>
        <span className={styles.action}>
          <span className={styles.label}>Import</span>
          <span className={styles.arrow} aria-hidden="true">↗</span>
        </span>
      </Link>
    </main>
  );
}
