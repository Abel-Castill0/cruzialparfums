"use client";

import { useState, type FormEvent } from "react";
import { buildContactMessage, buildWhatsAppUrl } from "@/domains/whatsapp/parfums-message-builder";
import styles from "./institutional.module.css";

const topics = [
  "Recomendación de fragancia",
  "Consulta de pedido",
  "Venta por mayor",
  "Otro",
] as const;

export function InstitutionalContactForm({
  storeName,
  whatsappNumber,
}: {
  storeName: string;
  whatsappNumber: string;
}) {
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const phone = String(data.get("phone") ?? "").trim();
    const topic = String(data.get("topic") ?? "");
    const message = String(data.get("message") ?? "").trim();

    if (!name || !phone || !message) {
      setError("Completa los campos obligatorios para continuar.");
      return;
    }

    setError(null);
    const text = buildContactMessage({ storeName, name, phone, topic, message });
    window.open(buildWhatsAppUrl(whatsappNumber, text), "_blank", "noopener,noreferrer");
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate={false}>
      <h3>Formulario de contacto</h3>
      <div className={styles.field}>
        <label htmlFor="contact-name">Nombre y apellido</label>
        <input id="contact-name" name="name" required placeholder="Tu nombre" aria-label="Nombre y apellido" />
      </div>
      <div className={styles.field}>
        <label htmlFor="contact-phone">WhatsApp</label>
        <input id="contact-phone" name="phone" type="tel" required inputMode="tel" placeholder="9XX XXX XXX" aria-label="WhatsApp" />
      </div>
      <div className={styles.field}>
        <label htmlFor="contact-topic">Motivo</label>
        <select id="contact-topic" name="topic" aria-label="Motivo de contacto">
          {topics.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor="contact-message">Mensaje</label>
        <textarea id="contact-message" name="message" rows={4} required placeholder="Cuéntanos cómo quieres oler o qué necesitas…" aria-label="Mensaje" />
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <button className={styles.submitBtn} type="submit">
        Enviar por WhatsApp <span aria-hidden="true">↗</span>
      </button>
      <small className={styles.formNote}>
        <b>Sin pasarela de pagos.</b> Este formulario abre una conversación de WhatsApp con nuestro equipo. Enviar no confirma un pedido.
      </small>
    </form>
  );
}