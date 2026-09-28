"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { adminButtonClass } from "./admin-ui";
import styles from "./order-workspace.module.css";

export type OrderStatusActionResult =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export type OrderActionOption = {
  target: string;
  label: string;
  consequence: string;
  variant: "primary" | "danger";
};

type Props = {
  orderId: string;
  currentStatus: string;
  primary: OrderActionOption | null;
  secondary: readonly OrderActionOption[];
  /** The unit's existing server action — it re-checks admin role and the
   * RPC re-validates the transition; this component only collects intent. */
  action: (orderId: string, expectedStatus: string, newStatus: string, reason?: string) => Promise<OrderStatusActionResult>;
};

/** Admin-only status controls. Rendered only for admins by the page; never
 * shows success before the server confirms (no optimistic status). */
export function OrderStatusPanel({ orderId, currentStatus, primary, secondary, action }: Props) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const [result, setResult] = useState<OrderStatusActionResult>({ status: "idle" });
  const [openDanger, setOpenDanger] = useState<string | null>(null);
  const reasonRef = useRef<HTMLInputElement | null>(null);
  const baseId = useId();
  const busy = pendingTarget !== null || isRefreshing;

  useEffect(() => {
    if (openDanger) reasonRef.current?.focus();
  }, [openDanger]);

  async function submit(target: string, reason?: string) {
    setPendingTarget(target);
    setResult({ status: "idle" });
    try {
      const response = await action(orderId, currentStatus, target, reason);
      setResult(response);
      if (response.status === "success") {
        setOpenDanger(null);
        startTransition(() => router.refresh());
      }
    } catch {
      setResult({
        status: "error",
        message: "No pudimos cambiar el estado del pedido. Recarga la información e inténtalo otra vez.",
      });
    } finally {
      setPendingTarget(null);
    }
  }

  return (
    <div className={styles.actionPanel}>
      {result.status === "success" ? (
        <p className={styles.feedbackSuccess} role="status">✓ {result.message}</p>
      ) : result.status === "error" ? (
        <p className={styles.feedbackError} role="alert">{result.message}</p>
      ) : null}

      {primary ? (
        <div className={styles.primaryAction}>
          <button
            type="button"
            className={adminButtonClass("primary")}
            disabled={busy}
            aria-describedby={`${baseId}-primary-consequence`}
            onClick={() => submit(primary.target)}
          >
            {pendingTarget === primary.target ? "Guardando…" : primary.label}
          </button>
          <p id={`${baseId}-primary-consequence`} className={styles.consequence}>{primary.consequence}</p>
        </div>
      ) : null}

      {secondary.length > 0 ? (
        <div className={styles.secondaryActions}>
          {secondary.map((option) => {
            const panelId = `${baseId}-${option.target}`;
            const expanded = openDanger === option.target;
            return (
              <div key={option.target} className={styles.secondaryAction}>
                {!expanded ? (
                  <button
                    type="button"
                    className={adminButtonClass(option.variant === "danger" ? "danger" : "secondary")}
                    disabled={busy}
                    aria-expanded={false}
                    aria-controls={panelId}
                    onClick={() => {
                      setResult({ status: "idle" });
                      setOpenDanger(option.target);
                    }}
                  >
                    {option.label}
                  </button>
                ) : (
                  <form
                    id={panelId}
                    className={styles.dangerConfirm}
                    aria-label={option.label}
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      const reason = String(data.get("reason") ?? "").trim();
                      void submit(option.target, reason || undefined);
                    }}
                  >
                    <strong className={styles.dangerTitle}>{option.label}</strong>
                    <p className={styles.consequence}>{option.consequence}</p>
                    {option.target === "cancelled" ? (
                      <label className={styles.field}>
                        <span>Motivo de la cancelación (requerido)</span>
                        <input
                          ref={reasonRef}
                          name="reason"
                          type="text"
                          placeholder="Razón de cancelación (requerida)"
                          required
                          minLength={3}
                          maxLength={300}
                          disabled={busy}
                        />
                        <span className={styles.fieldHint}>Queda registrado en el historial del pedido.</span>
                      </label>
                    ) : null}
                    <div className={styles.dangerButtons}>
                      <button type="submit" className={adminButtonClass(option.variant === "danger" ? "danger" : "primary")} disabled={busy}>
                        {pendingTarget === option.target ? "Guardando…" : option.target === "cancelled" ? "Confirmar cancelación" : `Confirmar: ${option.label}`}
                      </button>
                      <button type="button" className={adminButtonClass("quiet")} disabled={busy} onClick={() => setOpenDanger(null)}>
                        Volver sin cambios
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
