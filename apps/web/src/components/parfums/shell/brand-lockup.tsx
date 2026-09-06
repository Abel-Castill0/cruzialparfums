import Image from "next/image";
import Link from "next/link";
import styles from "./parfums-shell.module.css";

export function ParfumsBrandLockup({ logoUrl }: { logoUrl: string | null }) {
  return (
    <Link href="/parfums" className={styles.brand} aria-label="Cruzial Parfums inicio">
      <span className={styles.brandMark}>
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt=""
            width={52}
            height={52}
            className={styles.logoImage}
            sizes="52px"
          />
        ) : (
          <span aria-hidden="true">C</span>
        )}
      </span>
      <span className={styles.brandWord}>
        <strong>CRUZIAL</strong>
        <small>PARFUMS</small>
      </span>
    </Link>
  );
}
