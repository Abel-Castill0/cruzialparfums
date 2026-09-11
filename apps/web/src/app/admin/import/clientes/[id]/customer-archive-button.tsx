"use client";

import { useRouter } from "next/navigation";
import { useActionState, useTransition, useState } from "react";
import { archiveImportCustomerAction } from "../customer-actions";
import styles from "../../productos/page.module.css";

type Props = {
  customerId: string;
  customerName: string;
};

export function CustomerArchiveButton({ customerId, customerName }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);

  const [state, formAction, isPending] = useActionState(
    async () => {
      const result = await archiveImportCustomerAction(customerId);
      if (result.status === "success") {
        startTransition(() => {
          router.refresh();
        });
      }
      return result;
    },
    null,
  );

  return (
    <section className={styles.section} aria-labelledby="archive-heading">
      <div className={styles.sectionTitle}>
        <h2 id="archive-heading">Archivar cliente</h2>
      </div>
      <p style={{ fontSize: 12, color: "#5c574f", marginBottom: 12 }}>
        Un cliente archivado no aparecerá en búsquedas de verificación de depósitos.
        Los pedidos históricos permanecen intactos.
      </p>
      {state?.status === "success" ? (
        <p className={styles.savedNote} role="status" aria-live="polite">{state.message}</p>
      ) : state?.status === "error" ? (
        <p className={styles.conflictBanner} role="alert">{state.message}</p>
      ) : null}
      {!showConfirm ? (
        <button
          type="button"
          className={styles.dangerButton}
          onClick={() => setShowConfirm(true)}
        >
          Archivar {customerName}
        </button>
      ) : (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#9a3b32" }}>
            ¿Archivar a {customerName}?
          </span>
          <form action={formAction}>
            <button
              type="submit"
              className={styles.dangerButton}
              disabled={isPending}
            >
              {isPending ? "Procesando..." : "Sí, archivar"}
            </button>
          </form>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setShowConfirm(false)}
            disabled={isPending}
          >
            Cancelar
          </button>
        </div>
      )}
    </section>
  );
}
