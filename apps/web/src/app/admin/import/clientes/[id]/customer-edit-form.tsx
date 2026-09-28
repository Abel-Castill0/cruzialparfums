"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SaveStatus, adminButtonClass, type SaveStatusState } from "@/components/admin/admin-ui";
import { updateImportCustomerAction } from "../customer-actions";
import styles from "@/components/admin/catalog-workspace.module.css";

type Props = {
  customerId: string;
  initialFullName: string;
  initialPhone: string | null;
  initialNotes: string | null;
};

export function CustomerEditForm({ customerId, initialFullName, initialPhone, initialNotes }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<SaveStatusState>("idle");
  const [message, setMessage] = useState<string | undefined>(undefined);

  return (
    <form
      className={styles.card}
      onChange={() => {
        setStatus("dirty");
        setMessage(undefined);
      }}
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const fullName = String(formData.get("full_name") ?? "");
        const phone = String(formData.get("phone") ?? "");
        const notes = String(formData.get("notes") ?? "");
        start(async () => {
          setStatus("saving");
          try {
            const result = await updateImportCustomerAction(customerId, fullName, phone || null, notes || null);
            if (result.status === "success") {
              setStatus("saved");
              setMessage("Datos del cliente guardados");
              router.refresh();
            } else {
              setStatus("error");
              setMessage(`${result.status === "error" ? result.message : "No se pudo guardar."} No se guardó.`);
            }
          } catch {
            setStatus("error");
            setMessage("No pudimos confirmar el guardado. Recarga antes de volver a intentarlo.");
          }
        });
      }}
    >
      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>Nombre completo *</span>
          <input id="full_name" name="full_name" type="text" required defaultValue={initialFullName} disabled={pending} />
        </label>
        <label className={styles.field}>
          <span>Teléfono</span>
          <input id="phone" name="phone" type="tel" defaultValue={initialPhone ?? ""} disabled={pending} />
        </label>
      </div>
      <label className={styles.field}>
        <span>Notas internas</span>
        <textarea id="notes" name="notes" rows={3} defaultValue={initialNotes ?? ""} disabled={pending} />
        <span className={styles.fieldHint}>Solo las ve tu equipo.</span>
      </label>
      <div className={styles.actionsRow}>
        <button type="submit" className={adminButtonClass("primary")} disabled={pending}>{pending ? "Guardando…" : "Guardar datos"}</button>
        <SaveStatus state={status} message={message} />
      </div>
    </form>
  );
}
