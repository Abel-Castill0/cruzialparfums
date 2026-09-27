"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import {
  createParfumsOrderRequest,
  startNewParfumsCheckoutAttempt,
  type CreateParfumsOrderResult,
} from "@/app/parfums/checkout/actions";
import { CartLine } from "@/components/parfums/cart/cart-line";
import { useParfumsCart } from "@/components/parfums/cart/use-parfums-cart";
import { Breadcrumbs } from "@/components/parfums/navigation/breadcrumbs";
import type { CatalogProduct } from "@/domains/catalog/types";
import { cartIdentity } from "@/domains/catalog/types";
import { handoffStorageKey } from "@/domains/orders/parfums-order-handoff";
import { PARFUMS_DELIVERY_OPTIONS } from "@/domains/orders/parfums-order-request";
import type { ParfumsCheckoutCustomer } from "@/domains/whatsapp/parfums-message-builder";
import { ATTEMPT_EXPIRED, startNewAttempt, submitWithAttemptCapability } from "@/lib/attempt-client";
import styles from "./checkout.module.css";

const emptyCustomer: ParfumsCheckoutCustomer = {
  name: "",
  phone: "",
  district: "",
  delivery: PARFUMS_DELIVERY_OPTIONS[0],
  note: "",
};

type ParfumsOrderSuccess = Extract<CreateParfumsOrderResult, { status: "success" }>;
/** A registered order the customer still has to acknowledge before this
 * browser may start another purchase:
 *  - "replayed": the server returned an order registered EARLIER under this
 *    attempt (a lost response, or a previous purchase whose rotation never
 *    completed). Nothing new was created; the customer chooses explicitly.
 *  - "rotation_failed": a new order was created and received, but the server
 *    has not yet confirmed the move to a fresh attempt. */
type HeldOrder = { kind: "replayed" | "rotation_failed"; order: ParfumsOrderSuccess };

const NEW_ATTEMPT_FAILED_MESSAGE =
  "No pudimos iniciar una nueva solicitud. Revisa tu conexión e inténtalo de nuevo; no registramos nada nuevo.";

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
  const [held, setHeld] = useState<HeldOrder | null>(null);
  const [isPending, startTransition] = useTransition();
  const errorRef = useRef<HTMLDivElement>(null);
  const heldRef = useRef<HTMLDivElement>(null);

  function resetAttempt() {
    setResult(null);
  }

  function updateCustomer(field: keyof ParfumsCheckoutCustomer, value: string) {
    setCustomer((current) => ({ ...current, [field]: value }));
    resetAttempt();
  }

  function showError(message: string) {
    setResult({ status: "error", message });
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  /** The acknowledged order becomes the success page; the cart it consumed
   * is cleared only now. */
  function completeWith(order: ParfumsOrderSuccess) {
    if (order.whatsappUrl) {
      try {
        sessionStorage.setItem(handoffStorageKey(order.orderNumber), order.whatsappUrl);
      } catch {
        // A safe reference-only fallback remains available on the next page.
      }
    }
    clear();
    router.push(`/parfums/gracias/${encodeURIComponent(order.orderNumber)}` as Route);
  }

  /** Retry of a failed rotation after a received success. The success panel
   * stays until the server confirms; the UI never enters a "new purchase"
   * state before that. */
  function retryRotationAndContinue(order: ParfumsOrderSuccess) {
    startTransition(async () => {
      if (await startNewAttempt(startNewParfumsCheckoutAttempt)) completeWith(order);
      else showError(NEW_ATTEMPT_FAILED_MESSAGE);
    });
  }

  /** "Ver solicitud registrada" acknowledges the earlier order. A failed
   * rotation here is harmless: the next submit is again reported as that
   * same registered order, never as a new one. */
  function acknowledgeReplayed(order: ParfumsOrderSuccess) {
    startTransition(async () => {
      await startNewAttempt(startNewParfumsCheckoutAttempt);
      completeWith(order);
    });
  }

  /** The only path from an expired or already-used attempt to a new
   * mutation: an explicit customer choice, and only after the server has
   * confirmed the new attempt. */
  function registerAsNewRequest() {
    startTransition(async () => {
      if (!(await startNewAttempt(startNewParfumsCheckoutAttempt))) {
        showError(NEW_ATTEMPT_FAILED_MESSAGE);
        return;
      }
      setHeld(null);
      setResult(null);
      await performSubmit();
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lines.length === 0 || isPending || held) return;
    setResult(null);
    startTransition(performSubmit);
  }

  async function performSubmit() {
    let actionResult: CreateParfumsOrderResult;
    try {
      // No client-side request id: the server derives the idempotency
      // identity from this browser's HttpOnly attempt cookie, which survives
      // a reload, so a retry after a lost response replays the original order
      // instead of creating a second one.
      const submission = {
        lines: lines.map((line) => ({
          productId: cartIdentity(line.product),
          variantId: line.variant.variantId,
          quantity: line.quantity,
        })),
        customer,
      };
      actionResult = await submitWithAttemptCapability(() => createParfumsOrderRequest(submission));
    } catch {
      // Network/connection failure: unknown outcome server-side. The attempt
      // cookie is untouched, so a retry (even after a reload) replays
      // idempotently instead of risking a second order.
      showError("No pudimos conectar con el servidor. Tu carrito se conserva. Intenta nuevamente.");
      return;
    }
    if (actionResult.status !== "success") {
      setResult(actionResult);
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    if (!actionResult.created) {
      // An order registered EARLIER under this attempt came back. Never
      // present it as a new purchase and never clear this cart for it.
      setHeld({ kind: "replayed", order: actionResult });
      requestAnimationFrame(() => heldRef.current?.focus());
      return;
    }
    // Resolved and received: the next checkout must be a new attempt. Only a
    // server-confirmed rotation lets the UI leave this success state.
    if (await startNewAttempt(startNewParfumsCheckoutAttempt)) {
      completeWith(actionResult);
      return;
    }
    setHeld({ kind: "rotation_failed", order: actionResult });
    requestAnimationFrame(() => heldRef.current?.focus());
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
                  onQuantity={(quantity) => { resetAttempt(); setQuantity(cartIdentity(line.product), line.variant.variantId, quantity); }}
                  onRemove={() => { resetAttempt(); remove(cartIdentity(line.product), line.variant.variantId); }}
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
            <p>
              Usaremos estos datos para registrar y atender tu solicitud y coordinarla por WhatsApp. Consulta la{" "}
              <Link href={"/parfums/privacidad" as Route}>Política de Privacidad</Link> y los{" "}
              <Link href={"/parfums/terminos" as Route}>Términos y Condiciones</Link>.
            </p>
          </div>
          <form onSubmit={submit} aria-busy={isPending}>
            {result?.status === "error" ? (
              <div ref={errorRef} className={styles.submitError} role="alert" tabIndex={-1}>
                <strong>No pudimos registrar la solicitud.</strong>
                <span>{result.message}</span>
                {result.code === ATTEMPT_EXPIRED ? (
                  <button type="button" className={styles.submitErrorAction} data-attempt-new
                    onClick={registerAsNewRequest} disabled={isPending}>
                    Registrar como nueva solicitud
                  </button>
                ) : null}
              </div>
            ) : null}
            {held ? (
              <div ref={heldRef} className={styles.submitError} data-attempt-held={held.kind}
                role={held.kind === "rotation_failed" ? "alert" : "status"} tabIndex={-1}>
                {held.kind === "replayed" ? (
                  <>
                    <strong>Esta solicitud ya estaba registrada: {held.order.orderNumber}</strong>
                    <span>No se creó una solicitud nueva. Puedes ver la solicitud registrada o, si quieres hacer otra compra, registrarla como nueva.</span>
                    <button type="button" className={styles.submitErrorAction} data-attempt-view
                      onClick={() => acknowledgeReplayed(held.order)} disabled={isPending}>
                      Ver solicitud registrada
                    </button>
                    <button type="button" className={styles.submitErrorAction} data-attempt-new
                      onClick={registerAsNewRequest} disabled={isPending}>
                      Registrar como nueva solicitud
                    </button>
                  </>
                ) : (
                  <>
                    <strong>Tu solicitud {held.order.orderNumber} quedó registrada.</strong>
                    <span>No pudimos preparar tu próxima compra. Reintenta para continuar; no se registrará nada nuevo.</span>
                    <button type="button" className={styles.submitErrorAction} data-attempt-retry
                      onClick={() => retryRotationAndContinue(held.order)} disabled={isPending}>
                      Reintentar y continuar
                    </button>
                  </>
                )}
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
            <button type="submit" className={styles.submit} data-checkout-submit disabled={lines.length === 0 || isPending || held !== null}>
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
