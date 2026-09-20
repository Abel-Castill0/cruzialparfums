"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { updateImportComplaintStatusAction } from "../actions";
import { COMPLAINT_STATUS_LABELS, type ComplaintStatus } from "@/domains/complaints/complaint-schema";
import styles from "../../productos/page.module.css";

const STATUS_OPTIONS: ComplaintStatus[] = ["received", "in_review", "resolved"];

export function ComplaintStatusForm({
  id,
  expectedUpdatedAt,
  currentStatus,
  currentNotes,
}: {
  id: string;
  expectedUpdatedAt: string;
  currentStatus: ComplaintStatus;
  currentNotes: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [notes, setNotes] = useState(currentNotes);

  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof updateImportComplaintStatusAction>> | null, formData: FormData) => {
      const newStatus = formData.get("new_status") as string;
      const result = await updateImportComplaintStatusAction(id, expectedUpdatedAt, newStatus, notes);
      if (result.status === "success") startTransition(() => router.refresh());
      return result;
    },
    null,
  );

  return (
    <section className={styles.section} aria-labelledby="complaint-status-heading">
      <div className={styles.sectionTitle}>
        <h2 id="complaint-status-heading">Estado del caso</h2>
      </div>

      {state?.status === "success" ? (
        <p className={styles.savedNote} role="status" aria-live="polite">{state.message}</p>
      ) : state?.status === "error" ? (
        <p className={styles.conflictBanner} role="alert">{state.message}</p>
      ) : null}

      <label className={styles.field} style={{ display: "block", marginBottom: 12 }}>
        <span>Notas internas (no visibles para el consumidor)</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          style={{ width: "100%", padding: 8, border: "1px solid #d7e0e9" }}
        />
      </label>

      <form action={formAction} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option}
            type="submit"
            name="new_status"
            value={option}
            className={option === currentStatus ? styles.primaryButton : styles.secondaryButton}
            disabled={isPending || option === currentStatus}
          >
            {COMPLAINT_STATUS_LABELS[option]}
            {option === currentStatus ? " (actual)" : ""}
          </button>
        ))}
      </form>
    </section>
  );
}
