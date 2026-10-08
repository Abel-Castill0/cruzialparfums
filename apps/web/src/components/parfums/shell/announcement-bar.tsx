import Link from "next/link";
import styles from "./parfums-shell.module.css";

export function AnnouncementBar() {
  return (
    <div className={styles.announcement}>
      <Link
        href="/"
        className={styles.announcementBack}
        aria-label="Volver a la página principal de Cruzial.pe"
      >
        <span className={styles.announcementBackArrow} aria-hidden="true">
          ←
        </span>
        <span className={styles.announcementBackLabel}>Cruzial.pe</span>
      </Link>
      <p className={styles.announcementInfo} role="status">
        Envíos por Shalom o motorizado <span aria-hidden="true">·</span> 100% Originales
        <span className={styles.announcementExtra}>
          {" "}
          <span aria-hidden="true">·</span> Decants Premium
        </span>
      </p>
      <span className={styles.announcementSpacer} aria-hidden="true" />
    </div>
  );
}
