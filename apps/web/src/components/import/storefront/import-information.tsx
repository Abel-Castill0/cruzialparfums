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
          <h2 id="import-process-title">Cómo funciona un consolidado</h2>
          <p>La campaña abre, reúne solicitudes, cierra y luego coordina cada entrega por un canal independiente de Parfums.</p>
        </div>
        <ol className={styles.processList}>
          <li><strong>Se abre</strong><span>El catálogo publica los productos, precios y disponibilidad confirmados para la campaña.</span></li>
          <li><strong>Se solicita</strong><span>Durante la campaña puedes agregar productos al carrito y registrar tu solicitud. El adelanto se valida al registrar.</span></li>
          <li><strong>Se cierra</strong><span>Al terminar el consolidado se procesa la compra grupal según sus condiciones.</span></li>
          <li><strong>Se entrega</strong><span>Los pedidos de Import se coordinan mediante delivery privado.</span></li>
        </ol>
      </section>

      <section className={styles.conditions} aria-labelledby="import-conditions-title">
        <div>
          <h2 id="import-conditions-title">Condiciones claras antes de pedir</h2>
          <p>El adelanto se calcula automáticamente al registrar tu solicitud, según tu historial como cliente.</p>
        </div>
        <dl>
          <div><dt>{depositPercentages.new === null ? "—" : `${depositPercentages.new}%`}</dt><dd>Cliente nuevo</dd></div>
          <div><dt>{depositPercentages.returning === null ? "—" : `${depositPercentages.returning}%`}</dt><dd>Historial de compras confirmado</dd></div>
          <div><dt>Entrega</dt><dd>Delivery privado</dd></div>
        </dl>
      </section>

      <section className={styles.faq} id="faq" aria-labelledby="import-faq-title">
        <div className={styles.faqHeading}>
          <h2 id="import-faq-title">Preguntas frecuentes</h2>
          <p>Información confirmada sobre la operación de Cruzial Import.</p>
        </div>
        <div className={styles.faqList}>
          {faqs.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.contact} aria-labelledby="import-contact-title">
        <div>
          <h2 id="import-contact-title">¿Necesitas confirmar una condición?</h2>
          <p>Escríbenos antes de solicitar. Te responderemos por el canal público de Cruzial Import.</p>
        </div>
        {waUrl ? (
          <a href={waUrl} target="_blank" rel="noopener noreferrer">Escribir por WhatsApp</a>
        ) : (
          <p role="status">El canal de contacto no está disponible temporalmente.</p>
        )}
      </section>
    </>
  );
}
