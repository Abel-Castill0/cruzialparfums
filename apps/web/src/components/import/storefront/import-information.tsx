import Image from "next/image";
import styles from "./import-information.module.css";
import type { ImportDepositPercentages } from "@/domains/import/import-deposit-policies";

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
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M4 8.5 12 13l8-4.5M12 13v7" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    number: "02",
    title: "Se solicita",
    description: "Durante la campaña puedes agregar productos al carrito y registrar tu solicitud. El adelanto se valida al registrar.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 3.5h9l3 3V20a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M8.5 11h7M8.5 14.5h7M8.5 8h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    number: "03",
    title: "Se cierra",
    description: "Al terminar el consolidado se procesa la compra grupal según sus condiciones.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="6" width="17" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M3.5 10h17M7 14.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    number: "04",
    title: "Se entrega",
    description: "Los pedidos de Import se coordinan mediante delivery privado.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 6.5h11v9H3v-9Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M14 9.5h4l3 3v3h-7v-6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <circle cx="7.5" cy="18" r="1.6" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="18" cy="18" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
] as const;

function PeopleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="17" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M14.5 19a4 4 0 0 1 6.5-3.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20V10M11 20V4M18 20v-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 6.5h11v9H3v-9Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M14 9.5h4l3 3v3h-7v-6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="7.5" cy="18" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="18" cy="18" r="1.6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function ImportInformation({
  contact,
  depositPercentages,
}: {
  contact: { whatsappNumber: string } | null;
  depositPercentages: ImportDepositPercentages;
}) {
  const faqs = buildFaqs(depositPercentages);
  const waUrl = contact
    ? `https://wa.me/${contact.whatsappNumber}?text=${encodeURIComponent("Hola Cruzial Import, quiero conocer cómo funciona el consolidado.")}`
    : "";
  return (
    <>
      <section className={styles.process} id="como-funciona" aria-labelledby="import-process-title">
        <div className={styles.processHeading}>
          <p className={styles.eyebrow}>Proceso del consolidado</p>
          <h2 id="import-process-title">Cómo funciona un consolidado</h2>
          <p>La campaña abre, reúne solicitudes, cierra y luego coordina cada entrega por un canal independiente de Parfums.</p>
        </div>
        <ol className={styles.processList}>
          {PROCESS_STEPS.map((step) => (
            <li key={step.number}>
              <span className={styles.processNumber}>{step.number}</span>
              <span className={styles.processIcon} aria-hidden="true">{step.icon}</span>
              <strong>{step.title}</strong>
              <span>{step.description}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.conditions} aria-labelledby="import-conditions-title">
        <div className={styles.conditionsVisual}>
          <Image
            src="/images/import-home/import-conditions-container.webp"
            alt="Contenedor Cruzial Import en puerto, al atardecer"
            fill
            loading="lazy"
            sizes="(max-width: 899px) 100vw, 42vw"
          />
        </div>
        <div className={styles.conditionsBody}>
          <div>
            <p className={styles.eyebrow}>Antes de solicitar</p>
            <h2 id="import-conditions-title">Condiciones claras antes de pedir</h2>
            <p>El adelanto se calcula automáticamente al registrar tu solicitud, según tu historial como cliente.</p>
          </div>
          <dl>
            <div>
              <span className={styles.conditionIcon} aria-hidden="true"><PeopleIcon /></span>
              <dt>{depositPercentages.new === null ? "—" : `${depositPercentages.new}%`}</dt>
              <dd>Adelanto para cliente nuevo<span>Aplica en tu primera compra.</span></dd>
            </div>
            <div>
              <span className={styles.conditionIcon} aria-hidden="true"><ChartIcon /></span>
              <dt>{depositPercentages.returning === null ? "—" : `${depositPercentages.returning}%`}</dt>
              <dd>Para clientes con historial confirmado<span>Un beneficio para clientes frecuentes.</span></dd>
            </div>
            <div className={styles.conditionDelivery}>
              <span className={styles.conditionIcon} aria-hidden="true"><TruckIcon /></span>
              <dt>Entrega</dt>
              <dd>Delivery privado<span>Los pedidos se coordinan de forma directa.</span></dd>
            </div>
          </dl>
        </div>
      </section>

      <section className={styles.faq} id="faq" aria-labelledby="import-faq-title">
        <div className={styles.faqHeading}>
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
      </section>

      <section className={styles.contact} aria-labelledby="import-contact-title">
        <Image
          src="/images/import-home/import-cta-boxes.webp"
          alt=""
          fill
          loading="lazy"
          sizes="100vw"
          className={styles.contactImage}
        />
        <div className={styles.contactBody}>
          <p className={styles.eyebrow}>¿Listo para pedir?</p>
          <h2 id="import-contact-title">¿Necesitas confirmar una condición?</h2>
          <p>Escríbenos antes de solicitar. Te responderemos por el canal público de Cruzial Import.</p>
          {waUrl ? (
            <a href={waUrl} target="_blank" rel="noopener noreferrer">Escribir por WhatsApp</a>
          ) : (
            <p role="status">El canal de contacto no está disponible temporalmente.</p>
          )}
        </div>
      </section>
    </>
  );
}
