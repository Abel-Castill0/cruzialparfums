import styles from "./catalog-unavailable-notice.module.css";

/**
 * Rendered when Supabase is configured but the public catalog read failed.
 * The storefront never substitutes stale legacy prices for a failed read, so
 * it says so plainly instead of showing an unexplained empty grid.
 */
export function CatalogUnavailableNotice() {
  return (
    <section className={styles.notice} role="status" aria-live="polite">
      <p className={styles.eyebrow}>Catálogo</p>
      <h2>El catálogo no está disponible en este momento.</h2>
      <p>
        No pudimos consultar productos ni precios. Vuelve a intentarlo en unos minutos;
        tu carrito se conserva en este dispositivo.
      </p>
    </section>
  );
}
