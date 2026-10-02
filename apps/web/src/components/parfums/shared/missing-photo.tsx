import styles from "./missing-photo.module.css";

/** Honest neutral stand-in for a product that has no photo yet. It never
 * shows a bottle, a generic perfume image or another product's picture —
 * only a plain panel that says the photo is pending — so nobody can mistake
 * it for the real product. The owner replaces it by uploading a real photo
 * in Admin. */
export function MissingPhoto({ label }: { label?: string }) {
  return (
    <span className={styles.missing} role="img" aria-label={label ?? "Foto próximamente"}>
      <span aria-hidden="true" className={styles.text}>Foto próximamente</span>
    </span>
  );
}
