"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useImportCart } from "@/components/import/cart/use-import-cart";
import { createImportOrderRequest, startNewImportCheckoutAttempt } from "@/app/import/checkout/actions";
import type { CreateImportOrderResult } from "@/app/import/checkout/actions";
import { getCurrentImportCampaignState } from "@/app/import/carrito/actions";
import type { ImportCartCampaignState } from "@/domains/carts/import-cart";
import { ATTEMPT_EXPIRED, startNewAttempt, submitWithAttemptCapability } from "@/lib/attempt-client";
import styles from "./page.module.css";

type CheckoutFormState =
  | { phase: "form" }
  | { phase: "submitting" }
  | { phase: "success"; data: NonNullable<CreateImportOrderResult & { status: "success" }> }
  | { phase: "error"; message: string; code?: string };

type ImportOrderSuccess = CreateImportOrderResult & { status: "success" };
/** A registered order still to be acknowledged before a new purchase:
 * "replayed" = registered EARLIER under this attempt (nothing new created);
 * "rotation_failed" = created and received, fresh attempt not yet confirmed. */
type HeldOrder = { kind: "replayed" | "rotation_failed"; order: ImportOrderSuccess };

const NEW_ATTEMPT_FAILED_MESSAGE =
  "No pudimos iniciar una nueva solicitud. Revisa tu conexión e inténtalo de nuevo; no registramos nada nuevo.";

function getStoredSuccess(): CreateImportOrderResult & { status: "success" } | null {
  try {
    const raw = sessionStorage.getItem("cruzial:import:last-success");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.status === "success" && typeof parsed.orderNumber === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

function storeSuccess(data: CreateImportOrderResult & { status: "success" }) {
  try {
    sessionStorage.setItem("cruzial:import:last-success", JSON.stringify(data));
  } catch {
    /* noop */
  }
}

function clearStoredSuccess() {
  try {
    sessionStorage.removeItem("cruzial:import:last-success");
  } catch {
    /* noop */
  }
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(value);
}

export default function ImportCheckoutPage() {
  const [campaignState, setCampaignState] = useState<ImportCartCampaignState>({ status: "loading" });
  const loadCampaignState = () => {
    getCurrentImportCampaignState().then(setCampaignState);
  };
  useEffect(() => {
    let active = true;
    getCurrentImportCampaignState().then((result) => {
      if (active) setCampaignState(result);
    });
    return () => {
      active = false;
    };
  }, []);

  const { lines, clear, reconciliation } = useImportCart(campaignState);
  const campaign = campaignState.status === "active" ? campaignState.campaign : null;
  const checkoutUsable = campaignState.status === "active";
  // Deterministic first render on server and client; the tab's last
  // success (a UX convenience only) is restored after hydration.
  const [formState, setFormState] = useState<CheckoutFormState>({ phase: "form" });
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      const saved = getStoredSuccess();
      if (active && saved) setFormState({ phase: "success", data: saved });
    });
    return () => {
      active = false;
    };
  }, []);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [held, setHeld] = useState<HeldOrder | null>(null);
  const [attemptBusy, setAttemptBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const heldRef = useRef<HTMLDivElement>(null);
  const displaySubtotal = useMemo(
    () => lines.reduce((sum, l) => sum + parseFloat(l.price) * l.quantity, 0),
    [lines],
  );

  const completeWith = useCallback((order: ImportOrderSuccess) => {
    storeSuccess(order);
    clear();
    setFormState({ phase: "success", data: order });
  }, [clear]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!checkoutUsable) return;
      setFieldErrors({});

      const fd = new FormData(e.currentTarget);
      const name = String(fd.get("name") ?? "").trim();
      const phone = String(fd.get("phone") ?? "").trim();
      const district = String(fd.get("district") ?? "").trim();
      const address = String(fd.get("address") ?? "").trim();
      const note = String(fd.get("note") ?? "").trim();

      const errors: Record<string, string> = {};
      if (name.length < 2) errors.name = "Ingresa tu nombre completo.";
      if (!/^[0-9]{9,15}$/.test(phone.replace(/\D/g, ""))) errors.phone = "Ingresa un número de WhatsApp válido (9-15 dígitos).";
      if (district.length < 2) errors.district = "Ingresa tu distrito o ciudad.";
      if (address.length < 2) errors.address = "Ingresa tu dirección de entrega.";

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        const first = formRef.current?.querySelector('[aria-invalid="true"]') as HTMLElement | null;
        first?.focus();
        return;
      }

      setFormState({ phase: "submitting" });

      try {
        // No client-side request id: the server derives the idempotency
        // identity from this browser's HttpOnly attempt cookie, so a retry
        // after a lost response (even across a reload) replays the original.
        const submission = {
          customer: { name, phone: phone.replace(/\D/g, "") },
          delivery: { district, address, ...(note ? { note } : {}) },
          lines: lines.map((l) => ({
            offerId: l.offerId,
            offerUpdatedAt: l.offerUpdatedAt,
            quantity: l.quantity,
          })),
        };
        const result = await submitWithAttemptCapability(() => createImportOrderRequest(submission));

        if (result.status === "error") {
          setFormState({ phase: "error", message: result.message, ...(result.code ? { code: result.code } : {}) });
          if (result.fieldErrors) setFieldErrors(result.fieldErrors);
          return;
        }

        if (!result.created) {
          // An order registered EARLIER under this attempt came back: never
          // present it as a new purchase and never clear this cart for it.
          setFormState({ phase: "form" });
          setHeld({ kind: "replayed", order: result });
          requestAnimationFrame(() => heldRef.current?.focus());
          return;
        }
        // Only a server-confirmed rotation lets the UI leave this success.
        if (await startNewAttempt(startNewImportCheckoutAttempt)) {
          completeWith(result);
          return;
        }
        setFormState({ phase: "form" });
        setHeld({ kind: "rotation_failed", order: result });
        requestAnimationFrame(() => heldRef.current?.focus());
      } catch {
        setFormState({
          phase: "error",
          message: "No pudimos conectar con el servidor. Tu carrito se conserva. Intenta nuevamente.",
        });
      }
    },
    [lines, checkoutUsable, completeWith],
  );

  /** Explicit "register as a new request": the only path from an expired or
   * already-used attempt to a new mutation, after a confirmed rotation. */
  async function registerAsNewRequest() {
    setAttemptBusy(true);
    const rotated = await startNewAttempt(startNewImportCheckoutAttempt);
    setAttemptBusy(false);
    if (!rotated) {
      setFormState({ phase: "error", message: NEW_ATTEMPT_FAILED_MESSAGE });
      return;
    }
    setHeld(null);
    setFormState({ phase: "form" });
    formRef.current?.requestSubmit();
  }

  async function acknowledgeHeld(order: ImportOrderSuccess, requireRotation: boolean) {
    setAttemptBusy(true);
    const rotated = await startNewAttempt(startNewImportCheckoutAttempt);
    setAttemptBusy(false);
    if (requireRotation && !rotated) {
      setFormState({ phase: "error", message: NEW_ATTEMPT_FAILED_MESSAGE });
      return;
    }
    setHeld(null);
    completeWith(order);
  }

  if (formState.phase === "success") {
    const d = formState.data;
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.success} aria-labelledby="success-title">
            <h1 id="success-title" className={styles.successHeading}>
              Tu solicitud fue registrada. Termina la coordinación por WhatsApp.
            </h1>

            <div className={styles.successSummary}>
              <div className={styles.summaryRow}>
                <span>Pedido</span><strong>{d.orderNumber}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>Consolidado</span><strong>#{d.campaignNumber}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>Subtotal</span><strong>{formatPrice(d.subtotal)}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>Adelanto ({d.depositPercentage}%)</span>
                <strong>{formatPrice(d.depositAmount)}</strong>
              </div>
            </div>

            <div className={styles.successInfo}>
              <p>El pago no se realiza en esta web.</p>
              <p>El delivery y el pago se coordinan por WhatsApp.</p>
              <p>El costo del delivery se confirma por WhatsApp.</p>
            </div>

            <div className={styles.successActions}>
              {d.whatsappUrl ? (
                <a
                  href={d.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.primaryAction}
                >
                  Abrir WhatsApp
                </a>
              ) : (
                <>
                  <p className={styles.whatsappProblem}>
                    Tu solicitud fue registrada con el número {d.orderNumber}, pero no pudimos preparar el enlace de WhatsApp en este momento.
                  </p>
                  <p className={styles.whatsappProblem}>
                    Contacta directamente a Cruzial Import para coordinar el delivery y la confirmación de tu solicitud.
                  </p>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  clearStoredSuccess();
                  setFormState({ phase: "form" });
                }}
                className={styles.secondaryAction}
              >
                Nueva solicitud
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (lines.length === 0 && formState.phase === "form") {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          {reconciliation?.status === "discarded" && (
            <div className={styles.noticeBanner} role="status" aria-live="polite">
              <p>
                {reconciliation.reason === "campaign_changed"
                  ? "El consolidado cambió desde tu última visita. Vaciamos tu carrito anterior para evitar precios u ofertas de un consolidado distinto."
                  : "No pudimos confirmar a qué consolidado pertenecía tu carrito guardado, así que lo vaciamos por seguridad."}
              </p>
            </div>
          )}
          {(reconciliation?.status === "closed" || campaignState.status === "closed") && (
            <div className={styles.noticeBanner} role="status" aria-live="polite">
              <p>El consolidado anterior ya cerró. No hay un consolidado vigente en este momento.</p>
            </div>
          )}
          <div className={styles.empty}>
            <p>Tu carrito de Import está vacío.</p>
            <Link href={"/import#catalogo" as Route} className={styles.primaryAction}>
              Ver catálogo
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.heading}>Checkout de Import</h1>

        {reconciliation?.status === "discarded" && (
          <div className={styles.noticeBanner} role="status" aria-live="polite">
            <p>
              {reconciliation.reason === "campaign_changed"
                ? "El consolidado cambió desde tu última visita. Vaciamos tu carrito anterior para evitar precios u ofertas de un consolidado distinto."
                : "No pudimos confirmar a qué consolidado pertenecía tu carrito guardado, así que lo vaciamos por seguridad."}
            </p>
          </div>
        )}

        {campaignState.status === "error" && (
          <div className={styles.errorBanner} role="alert" aria-live="assertive">
            <p>No pudimos confirmar el consolidado vigente. Tu carrito se conserva, pero no puedes registrar tu solicitud hasta confirmarlo.</p>
            <button type="button" onClick={loadCampaignState} className={styles.secondaryAction}>
              Reintentar
            </button>
          </div>
        )}

        {formState.phase === "error" && (
          <div className={styles.errorBanner} role="alert" aria-live="assertive">
            <p>{formState.message}</p>
            {formState.code === ATTEMPT_EXPIRED && (
              <button type="button" data-attempt-new onClick={registerAsNewRequest} disabled={attemptBusy}
                className={styles.secondaryAction}>
                Registrar como nueva solicitud
              </button>
            )}
          </div>
        )}

        {held && (
          <div ref={heldRef} className={styles.errorBanner} data-attempt-held={held.kind} tabIndex={-1}
            role={held.kind === "rotation_failed" ? "alert" : "status"}>
            {held.kind === "replayed" ? (
              <>
                <p><strong>Esta solicitud ya estaba registrada: {held.order.orderNumber}.</strong> No se creó una solicitud nueva. Puedes ver la solicitud registrada o, si quieres hacer otra compra, registrarla como nueva.</p>
                <button type="button" data-attempt-view onClick={() => acknowledgeHeld(held.order, false)}
                  disabled={attemptBusy} className={styles.secondaryAction}>
                  Ver solicitud registrada
                </button>
                <button type="button" data-attempt-new onClick={registerAsNewRequest} disabled={attemptBusy}
                  className={styles.secondaryAction}>
                  Registrar como nueva solicitud
                </button>
              </>
            ) : (
              <>
                <p><strong>Tu solicitud {held.order.orderNumber} quedó registrada.</strong> No pudimos preparar tu próxima compra. Reintenta para continuar; no se registrará nada nuevo.</p>
                <button type="button" data-attempt-retry onClick={() => acknowledgeHeld(held.order, true)}
                  disabled={attemptBusy} className={styles.secondaryAction}>
                  Reintentar y continuar
                </button>
              </>
            )}
          </div>
        )}

        <form ref={formRef} onSubmit={handleSubmit} noValidate className={styles.form}>
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Resumen</legend>
            {campaign && (
              <p className={styles.summaryNote}>
                Consolidado vigente: #{campaign.number}
              </p>
            )}
            <div className={styles.cartSummary}>
              {lines.map((line) => (
                <div key={line.offerId} className={styles.summaryLine}>
                  <span>{line.productName} — {line.label}</span>
                  <span>{line.quantity} × {formatPrice(parseFloat(line.price))} = {formatPrice(parseFloat(line.price) * line.quantity)}</span>
                </div>
              ))}
              <div className={`${styles.summaryLine} ${styles.totalLine}`}>
                <span>Subtotal estimado</span>
                <strong>{formatPrice(displaySubtotal)}</strong>
              </div>
            </div>
            <p className={styles.summaryNote}>
              Los precios y disponibilidad se verifican al registrar tu pedido. El porcentaje de anticipo depende de tu historial como cliente y se confirmará antes de coordinar el pago.
            </p>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Datos</legend>
            <div className={styles.field}>
              <label htmlFor="checkout-name">Nombre *</label>
              <input
                id="checkout-name"
                name="name"
                type="text"
                required
                autoComplete="name"
                aria-invalid={!!fieldErrors.name}
                aria-describedby={fieldErrors.name ? "err-name" : undefined}
              />
              {fieldErrors.name && <p id="err-name" className={styles.fieldError}>{fieldErrors.name}</p>}
            </div>
            <div className={styles.field}>
              <label htmlFor="checkout-phone">WhatsApp *</label>
              <input
                id="checkout-phone"
                name="phone"
                type="tel"
                required
                autoComplete="tel"
                placeholder="9XXXXXXXX"
                aria-invalid={!!fieldErrors.phone}
                aria-describedby={fieldErrors.phone ? "err-phone" : undefined}
              />
              {fieldErrors.phone && <p id="err-phone" className={styles.fieldError}>{fieldErrors.phone}</p>}
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Delivery</legend>
            <p className={styles.deliveryNote}>Delivery privado. El costo y horario se coordinan por WhatsApp.</p>
            <div className={styles.field}>
              <label htmlFor="checkout-district">Distrito / ciudad *</label>
              <input
                id="checkout-district"
                name="district"
                type="text"
                required
                aria-invalid={!!fieldErrors.district}
                aria-describedby={fieldErrors.district ? "err-district" : undefined}
              />
              {fieldErrors.district && <p id="err-district" className={styles.fieldError}>{fieldErrors.district}</p>}
            </div>
            <div className={styles.field}>
              <label htmlFor="checkout-address">Dirección / referencia *</label>
              <input
                id="checkout-address"
                name="address"
                type="text"
                required
                aria-invalid={!!fieldErrors.address}
                aria-describedby={fieldErrors.address ? "err-address" : undefined}
              />
              {fieldErrors.address && <p id="err-address" className={styles.fieldError}>{fieldErrors.address}</p>}
            </div>
            <div className={styles.field}>
              <label htmlFor="checkout-note">Nota (opcional)</label>
              <textarea id="checkout-note" name="note" rows={3} maxLength={500} />
            </div>
            <p className={styles.summaryNote}>
              Usaremos estos datos para registrar y atender tu solicitud y coordinarla por WhatsApp. Consulta la{" "}
              <Link href={"/import/privacidad" as Route}>Política de Privacidad</Link> y los{" "}
              <Link href={"/import/terminos" as Route}>Términos y Condiciones</Link>.
            </p>
          </fieldset>

          <div className={styles.formActions}>
            <button
              type="submit"
              disabled={formState.phase === "submitting" || !checkoutUsable || held !== null || attemptBusy}
              className={styles.primaryAction}
            >
              {formState.phase === "submitting"
                ? "Registrando solicitud..."
                : checkoutUsable
                  ? "Registrar solicitud"
                  : "Confirmando consolidado…"}
            </button>
            <Link href={"/import/carrito" as Route} className={styles.secondaryAction}>
              Volver al carrito
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
