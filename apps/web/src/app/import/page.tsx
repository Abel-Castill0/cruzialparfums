import type { Metadata } from "next";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Cruzial Import",
  description: "Importaciones, consolidados y productos seleccionados.",
};

// Foundation-only categories: data, not per-category code paths — adding a
// real category later (e.g. a confirmed Relojes launch) means editing this
// array, not writing a special case. No fake products/prices attached.
const categories = [
  {
    title: "Consolidado",
    note: "Compra grupal por campaña, con fechas y condiciones propias.",
    badge: "Próximamente",
  },
  {
    title: "Importaciones",
    note: "Selección de productos traídos bajo pedido.",
    badge: "Próximamente",
  },
  {
    title: "Relojes",
    note: "Una categoría más dentro de Import, no el catálogo completo.",
    badge: "Próximamente",
  },
  {
    title: "Más categorías",
    note: "Import crece por campaña confirmada, no por catálogo masivo.",
    badge: "Próximamente",
  },
] as const;

export default function ImportHomePage() {
  return (
    <main className={styles.home}>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>Cruzial Import</p>
          <h1>Importaciones y consolidados.</h1>
          <p>
            Un negocio independiente de Cruzial Parfums: catálogo, carrito,
            envío y condiciones propias.
          </p>
        </div>
      </section>

      <div className={styles.status}>
        <div className={styles.statusCard}>
          <p className={styles.statusLabel}>Estado del consolidado</p>
          <p className={styles.statusValue}>Sin consolidado activo por ahora</p>
          <p className={styles.statusNote}>
            Cuando exista una campaña real y confirmada, su fecha y condiciones
            se mostrarán aquí — nunca una fecha estimada.
          </p>
        </div>
      </div>

      <section className={styles.categories} aria-labelledby="import-categories-title">
        <div className={styles.sectionHead}>
          <p>Categorías</p>
          <h2 id="import-categories-title">Lo que viene en Import</h2>
        </div>
        <div className={styles.categoryGrid}>
          {categories.map((category) => (
            <article key={category.title} className={styles.categoryCard} data-available="false">
              <span className={styles.categoryTitle}>{category.title}</span>
              <p className={styles.categoryNote}>{category.note}</p>
              <span className={styles.categoryBadge}>{category.badge}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
