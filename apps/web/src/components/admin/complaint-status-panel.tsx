"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { COMPLAINT_STATUS_LABELS, type ComplaintStatus } from "@/domains/complaints/complaint-schema";
import { Notice, adminButtonClass } from "./admin-ui";
import catalogStyles from "./catalog-workspace.module.css";

const STATUS_OPTIONS: ComplaintStatus[] = ["received", "in_review", "resolved"];

export type UpdateComplaintStatusResult =
  | { status: "success"; message: string }
  | { status: "error"; message: string };

/**
 * Shared by Parfums and Import — the NEXT-ACTION control for a case: pick
 * the target state directly (the RPC allows any of the three from any of
 * the three; this never fabricates a restricted workflow) with an internal
 * note attached to that same change. The unit's page supplies its own
 * server action bound to `id`/`expectedUpdatedAt`.
 */
export function ComplaintStatusPanel({
  id,
  expectedUpdatedAt,
  currentStatus,
  currentNotes,
  canWrite,
  updateStatus,
}: {
  id: string;
  expectedUpdatedAt: string;
  currentStatus: ComplaintStatus;
  currentNotes: string;
  canWrite: boolean;
  updateStatus: (id: string, expectedUpdatedAt: string, newStatus: string, adminNotes: string) => Promise<UpdateComplaintStatusResult>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [notes, setNotes] = useState(currentNotes);

  const [state, formAction, isPending] = useActionState(
    async (_prev: UpdateComplaintStatusResult | null, formData: FormData) => {
      const newStatus = formData.get("new_status") as string;
      const result = await updateStatus(id, expectedUpdatedAt, newStatus, notes);
      if (result.status === "success") startTransition(() => router.refresh());
      return result;
    },
    null,
  );

  if (!canWrite) {
    return (
      <p className={catalogStyles.muted}>
        Acceso de solo lectura: puedes consultar este caso, pero no cambiar su estado.
      </p>
    );
  }

  return (
    <div className={catalogStyles.toolbar}>
      {state?.status === "success" ? (
        <Notice tone="healthy" title={state.message} />
      ) : state?.status === "error" ? (
        <Notice tone="danger" title="No se guardó">{state.message}</Notice>
      ) : null}

      <label className={catalogStyles.field}>
        <span>Notas internas (no visibles para el consumidor)</span>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} disabled={isPending} />
      </label>

      <form action={formAction} className={catalogStyles.actionsRow}>
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option}
            type="submit"
            name="new_status"
            value={option}
            className={adminButtonClass(option === currentStatus ? "quiet" : "secondary")}
            disabled={isPending || option === currentStatus}
          >
            {COMPLAINT_STATUS_LABELS[option]}
            {option === currentStatus ? " (actual)" : ""}
          </button>
        ))}
      </form>
    </div>
  );
}
