"use client";

import type { Route } from "next";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { CartLine } from "@/components/parfums/cart/cart-line";
import { useParfumsCart } from "@/components/parfums/cart/use-parfums-cart";
import { Breadcrumbs } from "@/components/parfums/navigation/breadcrumbs";
import { formatParfumsVariant } from "@/domains/carts/parfums-cart-pricing";
import type { CatalogProduct } from "@/domains/catalog/types";
import {
  buildCheckoutMessage,
  buildWhatsAppUrl,
  type ParfumsCheckoutCustomer,
} from "@/domains/whatsapp/parfums-message-builder";
import styles from "./checkout.module.css";

const deliveryOptions = [
  "Lima Metropolitana — Línea 1 (delivery gratis)",
  "Lima Metropolitana — Motorizado",
  "Lima Metropolitana — Contraentrega",
  "Provincias — Agencia Shalom",
] as const;

const emptyCustomer: ParfumsCheckoutCustomer = {
  name: "",
  phone: "",
  district: "",
  delivery: deliveryOptions[0],
  note: "",
};

function money(value: number) {
  return `S/ ${value.toFixed(2)}`;
}

export function CheckoutExperience({
  products,
  whatsappNumber,
  storeName,
}: {
  products: CatalogProduct[];
  whatsappNumber: string;
  storeName: string;
}) {
  const { lines, total, persistenceError, setQuantity, remove, clear } = useParfumsCart(products);
  const [customer, setCustomer] = useState(emptyCustomer);
  const [submitState, setSubmitState] = useState<"idle" | "opened" | "blocked">("idle");

  const message = useMemo(() => buildCheckoutMessage({
    storeName,
    lines: lines.map((line) => ({
      brand: line.product.brand,
      name: line.product.name,
      variantLabel: formatParfumsVariant(line),
      quantity: line.quantity,
      subtotal: line.subtotal,
      ...(line.product.comboContent
        ? { contents: line.product.comboContent.perfumes }
        : {}),
    })),
    total,
    customer,
  }), [customer, lines, storeName, total]);
  const whatsappUrl = buildWhatsAppUrl(whatsappNumber, message);

  function updateCustomer(field: keyof ParfumsCheckoutCustomer, value: string) {
    setCustomer((current) => ({ ...current, [field]: value }));
    setSubmitState("idle");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lines.length === 0) return;
    const popup = window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    setSubmitState(popup === null ? "blocked" : "opened");
  }

  return (
    <div className={styles.page}>
      <Breadcrumbs items={[
        { label: "Catálogo", href: "/parfums/catalogo" as Route },
        { label: "Checkout" },
      ]} />
      <header className={styles.hero}>
        <p>Continúa en WhatsApp</p>
        <h1>Tu selección,<br /><em>a un mensaje.</em></h1>
        <span>Revisa cantidades y completa tus datos. Luego abriremos WhatsApp para confirmar stock, envío y total final.</span>
      </header>

      <div className={styles.grid} data-checkout-grid>
        <section className={styles.cartPanel} aria-labelledby="selection-title">
          <div className={styles.panelHead}>
            <div>
              <span>Paso 1</span>
              <h2 id="selection-title">Tu selección</h2>
            </div>
            {lines.length > 0 ? <button type="button" onClick={clear}>Vaciar carrito</button> : null}
          </div>
          {lines.length === 0 ? (
            <div className={styles.empty}>
              <strong>Aún no hay productos en tu selección.</strong>
              <p>Vuelve al catálogo, elige una presentación y regresa para continuar.</p>
              <Link href={"/parfums/catalogo" as Route}>Explorar catálogo <span aria-hidden="true">→</span></Link>
            </div>
          ) : (
            <div className={styles.lines}>
              {lines.map((line) => (
                <CartLine
                  key={line.key}
                  line={line}
                  onQuantity={(quantity) => setQuantity(line.product.legacyId, line.variant.variantId, quantity)}
                  onRemove={() => remove(line.product.legacyId, line.variant.variantId)}
                />
              ))}
            </div>
          )}
          {persistenceError ? <p className={styles.error} role="alert">No pudimos guardar el cambio. Revisa el almacenamiento del navegador.</p> : null}
          <div className={styles.total}>
            <span>Total estimado</span>
            <strong data-checkout-total>{money(total)}</strong>
          </div>
          <p className={styles.estimate}>Este monto aún no incluye un envío por confirmar.</p>
        </section>

        <aside className={styles.formPanel} data-checkout-form-panel aria-labelledby="details-title">
          <div className={styles.formHead}>
            <span>Paso 2</span>
            <h2 id="details-title">Datos para coordinar</h2>
            <p>Los usaremos únicamente para preparar el mensaje de WhatsApp.</p>
          </div>
          <form action={whatsappUrl} target="_blank" onSubmit={submit}>
            <label>
              Nombre y apellido
              <input required autoComplete="name" value={customer.name} onChange={(event) => updateCustomer("name", event.target.value)} placeholder="Tu nombre completo" />
            </label>
            <label>
              WhatsApp
              <input required type="tel" inputMode="tel" autoComplete="tel" value={customer.phone} onChange={(event) => updateCustomer("phone", event.target.value)} placeholder="9XX XXX XXX" />
            </label>
            <label>
              Distrito / Ciudad
              <input required autoComplete="address-level2" value={customer.district} onChange={(event) => updateCustomer("district", event.target.value)} placeholder="Ej. Miraflores, Lima" />
            </label>
            <label>
              Entrega
              <select value={customer.delivery} onChange={(event) => updateCustomer("delivery", event.target.value)}>
                {deliveryOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label>
              Nota <small>opcional</small>
              <textarea rows={3} value={customer.note} onChange={(event) => updateCustomer("note", event.target.value)} placeholder="Horario, referencias o preferencias…" />
            </label>
            <button type="submit" className={styles.submit} data-checkout-submit disabled={lines.length === 0}>
              {lines.length === 0 ? "Añade productos para continuar" : "Continuar en WhatsApp"} <span aria-hidden="true">↗</span>
            </button>
            <p className={styles.formNote}><strong>Sin pagos dentro de la web.</strong> En WhatsApp confirmaremos disponibilidad, envío, total final y los siguientes pasos.</p>
            <div className={styles.submitFeedback} aria-live="polite">
              {submitState === "opened" ? "WhatsApp fue abierto. Continúa allí para confirmar." : null}
              {submitState === "blocked" ? <span>El navegador bloqueó la ventana. <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">Abrir WhatsApp manualmente</a>.</span> : null}
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
}
