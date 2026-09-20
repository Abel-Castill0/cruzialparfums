"use client";

import { useRouter } from "next/navigation";
import { useActionState, useTransition } from "react";
import { updateImportCustomerAction } from "../customer-actions";
import styles from "../../productos/page.module.css";

type Props = {
  customerId: string;
  initialFullName: string;
  initialPhone: string | null;
  initialNotes: string | null;
};

export function CustomerEditForm({ customerId, initialFullName, initialPhone, initialNotes }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof updateImportCustomerAction>> | null, formData: FormData) => {
      const fullName = formData.get("full_name") as string;
      const phone = formData.get("phone") as string;
      const notes = formData.get("notes") as string;
      const result = await updateImportCustomerAction(customerId, fullName, phone || null, notes || null);
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
    <section className={styles.section} aria-labelledby="edit-heading">
      <div className={styles.sectionTitle}>
        <h2 id="edit-heading">Editar cliente</h2>
      </div>
      {state?.status === "success" ? (
        <p className={styles.savedNote} role="status" aria-live="polite">{state.message}</p>
      ) : state?.status === "error" ? (
        <p className={styles.conflictBanner} role="alert">{state.message}</p>
      ) : null}
      <form action={formAction} style={{ display: "grid", gap: 12 }}>
        <div>
          <label htmlFor="full_name" style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8a8378", marginBottom: 4 }}>
            Nombre completo *
          </label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            required
            defaultValue={initialFullName}
            style={{ width: "100%", minHeight: 44, padding: "0 12px", border: "1px solid rgba(23,19,15,0.2)", fontSize: 13 }}
          />
        </div>
        <div>
          <label htmlFor="phone" style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8a8378", marginBottom: 4 }}>
            Teléfono
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={initialPhone ?? ""}
            style={{ width: "100%", minHeight: 44, padding: "0 12px", border: "1px solid rgba(23,19,15,0.2)", fontSize: 13 }}
          />
        </div>
        <div>
          <label htmlFor="notes" style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8a8378", marginBottom: 4 }}>
            Notas
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={initialNotes ?? ""}
            style={{ width: "100%", minHeight: 80, padding: "8px 12px", border: "1px solid rgba(23,19,15,0.2)", fontSize: 13, resize: "vertical" }}
          />
        </div>
        <div className={styles.formActions}>
          <button type="submit" className={styles.primaryButton} disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </form>
    </section>
  );
}
