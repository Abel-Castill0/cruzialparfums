"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import {
  createParfumsOrderRequest,
  type CreateParfumsOrderResult,
} from "@/app/parfums/checkout/actions";
import { CartLine } from "@/components/parfums/cart/cart-line";
import { useParfumsCart } from "@/components/parfums/cart/use-parfums-cart";
import { Breadcrumbs } from "@/components/parfums/navigation/breadcrumbs";
import type { CatalogProduct } from "@/domains/catalog/types";
import { handoffStorageKey } from "@/domains/orders/parfums-order-handoff";
import { PARFUMS_DELIVERY_OPTIONS } from "@/domains/orders/parfums-order-request";
import type { ParfumsCheckoutCustomer } from "@/domains/whatsapp/parfums-message-builder";
import styles from "./checkout.module.css";

const emptyCustomer: ParfumsCheckoutCustomer = {
  name: "",
  phone: "",
  district: "",
  delivery: PARFUMS_DELIVERY_OPTIONS[0],
  note: "",
};

function money(value: number) {
  return `S/ ${value.toFixed(2)}`;
}

export function CheckoutExperience({
  products,
}: {
  products: CatalogProduct[];
}) {
  const router = useRouter();
  const { lines, total, persistenceError, setQuantity, remove, clear } = useParfumsCart(products);
  const [customer, setCustomer] = useState(emptyCustomer);
  const [result, setResult] = useState<CreateParfumsOrderResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestIdRef = useRef<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  function resetAttempt() {
    requestIdRef.current = null;
    setResult(null);
  }

  function updateCustomer(field: keyof ParfumsCheckoutCustomer, value: string) {
    setCustomer((current) => ({ ...current, [field]: value }));
    resetAttempt();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lines.length === 0 || isPending) return;
    requestIdRef.current ??= crypto.randomUUID();
    const requestId = requestIdRef.current;
    setResult(null);
    startTransition(async () => {
      const actionResult = await createParfumsOrderRequest({
        requestId,
        lines: lines.map((line) => ({
          productId: line.product.legacyId,
          variantId: line.variant.variantId,
          quantity: line.quantity,
        })),
        customer,
      });
      setResult(actionResult);
      if (actionResult.status !== "success") {
        requestAnimationFrame(() => errorRef.current?.focus());
        return;
      }
      try {
        sessionStorage.setItem(handoffStorageKey(actionResult.orderNumber), actionResult.whatsappUrl);
      } catch {
        // A safe reference-only fallback remains available on the next page.
      }
      clear();
      router.push(`/parfums/gracias/${encodeURIComponent(actionResult.orderNumber)}` as Route);
    });
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
            {lines.length > 0 ? <button type="button" onClick={() => { resetAttempt(); clear(); }}>Vaciar carrito</button> : null}
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
                  onQuantity={(quantity) => { resetAttempt(); setQuantity(line.product.legacyId, line.variant.variantId, quantity); }}
                  onRemove={() => { resetAttempt(); remove(line.product.legacyId, line.variant.variantId); }}
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
          <form onSubmit={submit} aria-busy={isPending}>
            {result?.status === "error" ? (
              <div ref={errorRef} className={styles.submitError} role="alert" tabIndex={-1}>
                <strong>No pudimos registrar la solicitud.</strong>
                <span>{result.message}</span>
              </div>
            ) : null}
            <label>
              Nombre y apellido
              <input id="checkout-name" required maxLength={120} autoComplete="name" value={customer.name} onChange={(event) => updateCustomer("name", event.target.value)} placeholder="Tu nombre completo" aria-invalid={Boolean(result?.status === "error" && result.fieldErrors?.name)} aria-describedby={result?.status === "error" && result.fieldErrors?.name ? "checkout-name-error" : undefined} />
              {result?.status === "error" && result.fieldErrors?.name ? <small id="checkout-name-error" className={styles.fieldError}>{result.fieldErrors.name}</small> : null}
            </label>
            <label>
              WhatsApp
              <input id="checkout-phone" required maxLength={30} type="tel" inputMode="tel" autoComplete="tel" value={customer.phone} onChange={(event) => updateCustomer("phone", event.target.value)} placeholder="9XX XXX XXX" aria-invalid={Boolean(result?.status === "error" && result.fieldErrors?.phone)} aria-describedby={result?.status === "error" && result.fieldErrors?.phone ? "checkout-phone-error" : undefined} />
              {result?.status === "error" && result.fieldErrors?.phone ? <small id="checkout-phone-error" className={styles.fieldError}>{result.fieldErrors.phone}</small> : null}
            </label>
            <label>
              Distrito / Ciudad
              <input id="checkout-district" required maxLength={120} autoComplete="address-level2" value={customer.district} onChange={(event) => updateCustomer("district", event.target.value)} placeholder="Ej. Miraflores, Lima" aria-invalid={Boolean(result?.status === "error" && result.fieldErrors?.district)} aria-describedby={result?.status === "error" && result.fieldErrors?.district ? "checkout-district-error" : undefined} />
              {result?.status === "error" && result.fieldErrors?.district ? <small id="checkout-district-error" className={styles.fieldError}>{result.fieldErrors.district}</small> : null}
            </label>
            <label>
              Entrega
              <select id="checkout-delivery" value={customer.delivery} onChange={(event) => updateCustomer("delivery", event.target.value)} aria-invalid={Boolean(result?.status === "error" && result.fieldErrors?.delivery)}>
                {PARFUMS_DELIVERY_OPTIONS.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label>
              Nota <small>opcional</small>
              <textarea id="checkout-note" maxLength={500} rows={3} value={customer.note} onChange={(event) => updateCustomer("note", event.target.value)} placeholder="Horario, referencias o preferencias…" />
            </label>
            <button type="submit" className={styles.submit} data-checkout-submit disabled={lines.length === 0 || isPending}>
              {lines.length === 0 ? "Añade productos para continuar" : isPending ? "Registrando solicitud…" : "Registrar y continuar"} <span aria-hidden="true">→</span>
            </button>
            <p className={styles.formNote}><strong>Sin pagos dentro de la web.</strong> Primero registraremos tu solicitud; después podrás coordinar disponibilidad, envío y pago por WhatsApp.</p>
            <div className={styles.submitFeedback} aria-live="polite">{isPending ? "Validando productos y precios…" : null}</div>
          </form>
        </aside>
      </div>
    </div>
  );
}
