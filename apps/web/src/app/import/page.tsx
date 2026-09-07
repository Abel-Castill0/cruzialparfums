import type { Metadata } from "next";
import { IMPORT_SETTINGS } from "@/domains/platform/settings";
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

const consolidatedSteps = [
  { num: "01", title: "Se anuncia", text: "Una campaña se programa (scheduled) con fecha de apertura." },
  { num: "02", title: "Se abre", text: "El consolidado queda abierto (open) para sumar pedidos hasta la fecha de cierre." },
  { num: "03", title: "Se cierra", text: "Se cierra (closed) el consolidado y se procesa la compra grupal." },
  { num: "04", title: "Se entrega", text: "Se despacha (fulfilled) por delivery privado, no por agencia." },
] as const;

const importFaqs = [
  {
    q: "¿Import comparte carrito o catálogo con Parfums?",
    a: "No. Son dos negocios independientes dentro de Cruzial: carrito, catálogo, envío y condiciones propias para cada uno.",
  },
  {
    q: "¿Cómo funciona el adelanto?",
    a: "Cliente nuevo: 50% de adelanto. Cliente con compras previas confirmadas: 70%. El porcentaje final se valida con el pedido, no solo con lo que el navegador declara.",
  },
  {
    q: "¿Cómo llega mi pedido?",
    a: "Por delivery privado, no por Shalom ni otra agencia — ese es el método de envío exclusivo de Import.",
  },
  {
    q: "¿Puedo comprar fuera de un consolidado?",
    a: "Depende de la categoría y campaña. Escríbenos por WhatsApp para confirmar disponibilidad y condiciones exactas.",
  },
] as const;

export default function ImportHomePage() {
  const waUrl = `https://wa.me/${IMPORT_SETTINGS.whatsappNumber}?text=${encodeURIComponent("Hola Cruzial Import, quiero más información.")}`;

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

      <section className={styles.section} aria-labelledby="featured-import-title">
        <div className={styles.sectionHead}>
          <p>Selección Import</p>
          <h2 id="featured-import-title">Productos destacados</h2>
        </div>
        <p className={styles.emptyNote}>
          Todavía no hay un catálogo Import confirmado. Esta sección se activa
          en cuanto exista una campaña o categoría real con productos.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="how-consolidated-title">
        <div className={styles.sectionHead}>
          <p>Cómo funciona</p>
          <h2 id="how-consolidated-title">El consolidado, paso a paso</h2>
        </div>
        <div className={styles.stepGrid}>
          {consolidatedSteps.map((step) => (
            <article key={step.num}>
              <span>{step.num}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.depositSection} aria-labelledby="deposit-title">
        <div>
          <p className={styles.eyebrowLight}>Adelanto</p>
          <h2 id="deposit-title">50% o 70%, según tu historial</h2>
          <p>
            Cliente nuevo: 50% de adelanto. Cliente con compras previas
            confirmadas: 70%. Tu estado se valida con el pedido — declararlo
            en el navegador no lo confirma por sí solo.
          </p>
        </div>
        <div className={styles.depositCards}>
          <div>
            <strong>50%</strong>
            <span>Cliente nuevo</span>
          </div>
          <div>
            <strong>70%</strong>
            <span>Cliente con historial confirmado</span>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="evidence-import-title">
        <p className={styles.eyebrow}>Evidencia real</p>
        <h2 id="evidence-import-title">Próximamente</h2>
        <p className={styles.emptyNote}>
          Reuniremos fotos reales de consolidados e importaciones despachadas.
          No publicamos evidencia que no sea nuestra.
        </p>
      </section>

      <section className={styles.deliverySection} aria-labelledby="delivery-title">
        <div>
          <p className={styles.eyebrow}>Envío</p>
          <h2 id="delivery-title">Delivery privado</h2>
          <p>
            Import usa delivery privado, no la agencia Shalom que usa Parfums.
            Es un método de envío propio de esta unidad de negocio.
          </p>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="import-faq-title" id="faq">
        <div className={styles.sectionHead}>
          <p>Preguntas frecuentes</p>
          <h2 id="import-faq-title">Antes de escribirnos</h2>
        </div>
        <div className={styles.faqGrid}>
          {importFaqs.map((item) => (
            <article key={item.q}>
              <h3>{item.q}</h3>
              <p>{item.a}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.eyebrowLight}>Cruzial Import</p>
        <h2>¿Quieres más información?</h2>
        <a href={waUrl} target="_blank" rel="noopener noreferrer" className={styles.finalCtaLink}>
          Escribir por WhatsApp <span aria-hidden="true">→</span>
        </a>
      </section>
    </main>
  );
}
