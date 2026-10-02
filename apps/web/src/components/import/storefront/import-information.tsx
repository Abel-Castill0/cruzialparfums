import Image from "next/image";
import { Reveal } from "@/components/storefront/home/reveal";
import type { ImportDepositPercentages } from "@/domains/import/import-deposit-policies";
import styles from "./import-information.module.css";

type Contact = { whatsappNumber: string } | null;

function buildFaqs(deposit: ImportDepositPercentages) {
  const depositAnswer =
    deposit.new === null && deposit.returning === null
      ? "El adelanto se confirma al registrar tu solicitud, según tu historial como cliente."
      : `El adelanto es ${deposit.new === null ? "un porcentaje a confirmar" : `${deposit.new}%`} para cliente nuevo y ${deposit.returning === null ? "un porcentaje a confirmar" : `${deposit.returning}%`} para cliente con compras previas confirmadas. Se calcula automáticamente al registrar tu solicitud.`;

  return [
    {
      question: "¿Import comparte carrito o catálogo con Parfums?",
      answer: "No. Cruzial Import y Cruzial Parfums mantienen catálogos, pedidos, envíos y condiciones independientes.",
    },
    {
      question: "¿Cómo funciona el adelanto?",
      answer: depositAnswer,
    },
    {
      question: "¿Cómo llega mi pedido?",
      answer: "Cruzial Import usa delivery privado. No utiliza la modalidad Shalom de Cruzial Parfums.",
    },
    {
      question: "¿Puedo comprar fuera de un consolidado?",
      answer: "No. Todas las compras de Cruzial Import se realizan dentro del consolidado vigente, con sus precios y su fecha de cierre.",
    },
  ] as const;
}

const PROCESS_STEPS = [
  {
    number: "01",
    title: "Se abre",
    description: "El catálogo publica los productos, precios y disponibilidad confirmados para la campaña.",
  },
  {
    number: "02",
    title: "Se solicita",
    description: "Durante la campaña agregas productos al carrito y registras tu solicitud. El adelanto se valida al registrar.",
  },
  {
    number: "03",
    title: "Se cierra",
    description: "Al terminar el consolidado se procesa la compra grupal según sus condiciones.",
  },
  {
    number: "04",
    title: "Se entrega",
    description: "Los pedidos de Import se coordinan mediante delivery privado.",
  },
] as const;

function percentLabel(value: number | null) {
  return value === null ? "—" : `${value}%`;
}

/** The consolidado as a timeline: one rail, four moments, no boxes. */
export function ImportProcess() {
  return (
    <section className={styles.process} id="como-funciona" aria-labelledby="import-process-title">
      <div className={styles.inner}>
        <Reveal>
          <div className={styles.heading}>
            <p className={styles.eyebrow}>Proceso del consolidado</p>
            <h2 id="import-process-title">Cómo funciona un consolidado</h2>
            <p>La campaña abre, reúne solicitudes, cierra y luego coordina cada entrega por un canal independiente de Parfums.</p>
          </div>
        </Reveal>
        <ol className={styles.steps}>
          {PROCESS_STEPS.map((step, index) => (
            <li key={step.number}>
              <Reveal delay={index * 90}>
                <span className={styles.stepNumber}>{step.number}</span>
                <strong>{step.title}</strong>
                <span className={styles.stepText}>{step.description}</span>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Deposit percentages come from admin-managed policy, never from copy. */
export function ImportConditions({ depositPercentages }: { depositPercentages: ImportDepositPercentages }) {
  return (
    <section className={styles.conditions} aria-labelledby="import-conditions-title">
      <div className={styles.conditionsVisual}>
        <Image
          src="/images/import-home/import-conditions-container.webp"
          alt="Contenedor Cruzial Import en puerto, al atardecer"
          fill
          loading="lazy"
          sizes="(max-width: 899px) 100vw, 46vw"
        />
      </div>
      <Reveal className={styles.conditionsBody}>
        <p className={styles.eyebrow}>Antes de solicitar</p>
        <h2 id="import-conditions-title">Condiciones claras antes de pedir</h2>
        <p className={styles.conditionsLead}>
          El adelanto se calcula automáticamente al registrar tu solicitud, según tu historial como cliente.
        </p>
        <dl className={styles.terms}>
          <div>
            <dt>{percentLabel(depositPercentages.new)}</dt>
            <dd>
              <strong>Adelanto para cliente nuevo</strong>
              <span>Aplica en tu primera compra.</span>
            </dd>
          </div>
          <div>
            <dt>{percentLabel(depositPercentages.returning)}</dt>
            <dd>
              <strong>Clientes con historial confirmado</strong>
              <span>Un beneficio para clientes frecuentes.</span>
            </dd>
          </div>
          <div>
            <dt className={styles.termText}>Entrega</dt>
            <dd>
              <strong>Delivery privado</strong>
              <span>Los pedidos se coordinan de forma directa.</span>
            </dd>
          </div>
        </dl>
      </Reveal>
    </section>
  );
}

export function ImportFaq({ depositPercentages }: { depositPercentages: ImportDepositPercentages }) {
  const faqs = buildFaqs(depositPercentages);
  return (
    <section className={styles.faq} id="faq" aria-labelledby="import-faq-title">
      <Reveal className={styles.inner}>
        <div className={styles.faqGrid}>
          <div className={styles.heading}>
            <p className={styles.eyebrow}>Dudas comunes</p>
            <h2 id="import-faq-title">Preguntas frecuentes</h2>
            <p>Información confirmada sobre la operación de Cruzial Import.</p>
          </div>
          <div className={styles.faqList}>
            {faqs.map((item) => (
              <details key={item.question}>
                <summary>
                  {item.question}
                  <span className={styles.faqChevron} aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export function ImportContactCta({ contact }: { contact: Contact }) {
  const waUrl = contact
    ? `https://wa.me/${contact.whatsappNumber}?text=${encodeURIComponent("Hola Cruzial Import, quiero conocer cómo funciona el consolidado.")}`
    : "";
  return (
    <section className={styles.contact} aria-labelledby="import-contact-title">
      <div className={styles.contactPanel}>
        <Image
          src="/images/import-home/import-cta-boxes.webp"
          alt=""
          fill
          loading="lazy"
          sizes="(max-width: 767px) 100vw, 1280px"
          className={styles.contactImage}
        />
        <div className={styles.contactBody}>
          <p className={styles.eyebrow}>¿Listo para pedir?</p>
          <h2 id="import-contact-title">¿Necesitas confirmar una condición?</h2>
          <p>Escríbenos antes de solicitar. Te responderemos por el canal público de Cruzial Import.</p>
          {waUrl ? (
            <a href={waUrl} target="_blank" rel="noopener noreferrer" className={styles.contactAction}>
              Escribir por WhatsApp <span aria-hidden="true">→</span>
            </a>
          ) : (
            <p role="status">El canal de contacto no está disponible temporalmente.</p>
          )}
        </div>
      </div>
    </section>
  );
}
