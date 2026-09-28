"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adminButtonClass } from "@/components/admin/admin-ui";
import { archiveImportCustomerAction } from "../customer-actions";
import styles from "@/components/admin/catalog-workspace.module.css";
import workspace from "@/components/admin/order-workspace.module.css";

type Props = {
  customerId: string;
  customerName: string;
};

export function CustomerArchiveButton({ customerId, customerName }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className={styles.card}>
      {error ? <p className={workspace.feedbackError} role="alert">{error}</p> : null}
      {!showConfirm ? (
        <>
          <p className={styles.muted}>
            Un cliente archivado no aparecerá en búsquedas de verificación de depósitos. Los pedidos históricos permanecen intactos.
          </p>
          <div>
            <button type="button" className={adminButtonClass("danger")} onClick={() => setShowConfirm(true)}>
              Archivar cliente
            </button>
          </div>
        </>
      ) : (
        <div className={workspace.dangerConfirm} role="group" aria-labelledby="archive-customer-confirm">
          <strong id="archive-customer-confirm" className={workspace.dangerTitle}>¿Archivar a {customerName}?</strong>
          <p className={workspace.consequence}>
            No aparecerá en búsquedas de verificación de depósitos y ya no podrá editarse ni cambiar de estado; no hay restauración desde el administrador. Los pedidos históricos permanecen intactos.
          </p>
          <div className={workspace.dangerButtons}>
            <button
              type="button"
              className={adminButtonClass("danger")}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  try {
                    const result = await archiveImportCustomerAction(customerId);
                    if (result.status === "success") {
                      setShowConfirm(false);
                      router.refresh();
                    } else setError(`${result.status === "error" ? result.message : "No se pudo archivar."} El cliente no se archivó.`);
                  } catch {
                    setError("No pudimos confirmar el cambio. Recarga la página antes de volver a intentarlo.");
                  }
                })
              }
            >
              {pending ? "Archivando…" : "Sí, archivar"}
            </button>
            <button type="button" className={adminButtonClass("quiet")} onClick={() => setShowConfirm(false)} disabled={pending}>
              Volver sin cambios
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
