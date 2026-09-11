"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { useImportCart } from "@/components/import/cart/use-import-cart";
import { createImportOrderRequest } from "@/app/import/checkout/actions";
import type { CreateImportOrderResult } from "@/app/import/checkout/actions";
import styles from "./page.module.css";

type CheckoutFormState =
  | { phase: "form" }
  | { phase: "submitting" }
  | { phase: "success"; data: NonNullable<CreateImportOrderResult & { status: "success" }> }
  | { phase: "error"; message: string };

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getStoredRequestId(): string | null {
  try {
    return sessionStorage.getItem("cruzial:import:checkout:request-id");
  } catch {
    return null;
  }
}

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
  const { lines, clear } = useImportCart();
  const [formState, setFormState] = useState<CheckoutFormState>(() => {
    const saved = getStoredSuccess();
    if (saved) return { phase: "success", data: saved };
    return { phase: "form" };
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const requestIdRef = useRef<string>(getStoredRequestId() || generateUUID());

  const displaySubtotal = useMemo(
    () => lines.reduce((sum, l) => sum + parseFloat(l.price) * l.quantity, 0),
    [lines],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
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
        const result = await createImportOrderRequest({
          requestId: requestIdRef.current,
          customer: { name, phone: phone.replace(/\D/g, "") },
          delivery: { district, address, ...(note ? { note } : {}) },
          lines: lines.map((l) => ({
            offerId: l.offerId,
            offerUpdatedAt: l.offerUpdatedAt,
            quantity: l.quantity,
          })),
        });

        if (result.status === "error") {
          setFormState({ phase: "error", message: result.message });
          if (result.fieldErrors) setFieldErrors(result.fieldErrors);
          return;
        }

        storeSuccess(result);
        clear();
        setFormState({ phase: "success", data: result });
      } catch {
        setFormState({
          phase: "error",
          message: "No pudimos conectar con el servidor. Tu carrito se conserva. Intenta nuevamente.",
        });
      }
    },
    [lines, clear],
  );

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

        {formState.phase === "error" && (
          <div className={styles.errorBanner} role="alert" aria-live="assertive">
            <p>{formState.message}</p>
          </div>
        )}

        <form ref={formRef} onSubmit={handleSubmit} noValidate className={styles.form}>
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Resumen</legend>
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
              Los precios y disponibilidad se verifican al registrar. El anticipo se calcula server-side (50% o 70%).
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
          </fieldset>

          <div className={styles.formActions}>
            <button
              type="submit"
              disabled={formState.phase === "submitting"}
              className={styles.primaryAction}
            >
              {formState.phase === "submitting" ? "Registrando solicitud..." : "Registrar solicitud"}
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
