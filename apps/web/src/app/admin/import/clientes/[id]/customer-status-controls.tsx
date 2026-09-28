"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adminButtonClass } from "@/components/admin/admin-ui";
import type { StatusOption } from "@/domains/admin-import/customer-presentation";
import { verifyImportCustomerStatusAction } from "../customer-actions";
import styles from "@/components/admin/catalog-workspace.module.css";
import workspace from "@/components/admin/order-workspace.module.css";

type Props = {
  customerId: string;
  currentStatus: string;
  /** Built server-side from the live deposit policies. */
  options: readonly StatusOption[];
};

/** Admin-only. Uses the existing verifyImportCustomerStatusAction; never
 * auto-verifies and never shows success before the server confirms. */
export function CustomerStatusControls({ customerId, currentStatus, options }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState<StatusOption | null>(null);
  const [result, setResult] = useState<{ status: "success" | "error"; message: string } | null>(null);
  const available = options.filter((option) => option.value !== currentStatus);

  function confirm(option: StatusOption) {
    start(async () => {
      try {
        const response = await verifyImportCustomerStatusAction(customerId, option.value);
        if (response.status === "success") {
          setResult({ status: "success", message: response.message });
          setConfirming(null);
          router.refresh();
        } else {
          setResult({ status: "error", message: `${response.status === "error" ? response.message : "No se pudo cambiar."} El estado no cambió.` });
        }
      } catch {
        setResult({ status: "error", message: "No pudimos confirmar el cambio. Recarga la página antes de volver a intentarlo." });
      }
    });
  }

  return (
    <div className={styles.cards}>
      {result?.status === "success" ? <p className={workspace.feedbackSuccess} role="status">✓ {result.message}</p> : null}
      {result?.status === "error" ? <p className={workspace.feedbackError} role="alert">{result.message}</p> : null}

      {confirming ? (
        <div className={workspace.dangerConfirm} role="group" aria-labelledby="customer-status-confirm">
          <strong id="customer-status-confirm" className={workspace.dangerTitle}>{confirming.label}: ¿confirmas?</strong>
          <p className={workspace.consequence}>{confirming.consequence} Los pedidos ya registrados conservan su depósito.</p>
          <div className={workspace.dangerButtons}>
            <button type="button" className={adminButtonClass("primary")} disabled={pending} onClick={() => confirm(confirming)}>
              {pending ? "Guardando…" : "Confirmar cambio"}
            </button>
            <button type="button" className={adminButtonClass("quiet")} disabled={pending} onClick={() => setConfirming(null)}>Volver sin cambios</button>
          </div>
        </div>
      ) : (
        <ul className={styles.cards} aria-label="Cambiar estado del cliente">
          {available.map((option) => (
            <li key={option.value} className={styles.actionsRow}>
              <button
                type="button"
                className={adminButtonClass(currentStatus === "pending_verification" && option.value !== "pending_verification" ? "primary" : "secondary")}
                disabled={pending}
                onClick={() => {
                  setResult(null);
                  setConfirming(option);
                }}
              >
                {option.label}
              </button>
              <span className={styles.muted}>{option.consequence}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
