import styles from "./brand-lockup.module.css";

export function BrandLockup() {
  return (
    <div className={styles.lockup} aria-label="Cruzial">
      <span className={styles.mark} aria-hidden="true">
        C
      </span>
      <strong>CRUZIAL</strong>
    </div>
  );
}
