"use client";

import { useRouter } from "next/navigation";
import { useActionState, useTransition } from "react";
import { updateImportOrderStatusAction } from "../order-actions";
import styles from "../../productos/page.module.css";

type Props = {
  orderId: string;
  currentStatus: string;
  allowedTransitions: string[];
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmar coordinación",
  fulfilled: "Marcar completado",
  cancelled: "Cancelar pedido",
};

export function OrderStatusControls({ orderId, currentStatus, allowedTransitions }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof updateImportOrderStatusAction>> | null, formData: FormData) => {
      const newStatus = formData.get("new_status") as string;
      const reason = formData.get("reason") as string | null;
      const result = await updateImportOrderStatusAction(orderId, currentStatus, newStatus, reason || undefined);
      if (result.status === "success") {
        startTransition(() => {
          router.refresh();
        });
      }
      return result;
    },
    null,
  );

  const showCancellationReason = allowedTransitions.includes("cancelled");

  return (
    <section className={styles.section} aria-labelledby="actions-heading">
      <div className={styles.sectionTitle}>
        <h2 id="actions-heading">Acciones</h2>
      </div>
      {state?.status === "success" ? (
        <p className={styles.savedNote} role="status" aria-live="polite">{state.message}</p>
      ) : state?.status === "error" ? (
        <p className={styles.conflictBanner} role="alert">{state.message}</p>
      ) : null}
      <div className={styles.formActions}>
        {allowedTransitions.map((newStatus) => (
          <form key={newStatus} action={formAction}>
            <input type="hidden" name="new_status" value={newStatus} />
            {newStatus === "cancelled" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label htmlFor={`reason-${newStatus}`} className={styles.srOnly}>
                  Razón de cancelación
                </label>
                <input
                  id={`reason-${newStatus}`}
                  name="reason"
                  type="text"
                  placeholder="Razón de cancelación (requerida)"
                  required
                  minLength={3}
                  maxLength={300}
                  style={{
                    minHeight: 44,
                    padding: "0 12px",
                    border: "1px solid rgba(23,19,15,0.2)",
                    fontSize: 13,
                    width: "100%",
                  }}
                />
                <button
                  type="submit"
                  className={styles.dangerButton}
                  disabled={isPending}
                >
                  {isPending ? "Procesando..." : STATUS_LABELS[newStatus] ?? newStatus}
                </button>
              </div>
            ) : (
              <button
                type="submit"
                className={newStatus === "cancelled" ? styles.dangerButton : styles.primaryButton}
                disabled={isPending}
              >
                {isPending ? "Procesando..." : STATUS_LABELS[newStatus] ?? newStatus}
              </button>
            )}
          </form>
        ))}
      </div>
    </section>
  );
}
