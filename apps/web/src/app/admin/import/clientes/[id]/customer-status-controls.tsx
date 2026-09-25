"use client";

import { useRouter } from "next/navigation";
import { useActionState, useTransition } from "react";
import { verifyImportCustomerStatusAction } from "../customer-actions";
import styles from "../../productos/page.module.css";

type Props = {
  customerId: string;
  currentStatus: string;
  depositPercentages: { new: number | null; returning: number | null };
};

export function CustomerStatusControls({ customerId, currentStatus, depositPercentages }: Props) {
  const statusOptions = [
    { value: "pending_verification", label: "Pendiente de verificación" },
    { value: "new", label: "Nuevo" },
    {
      value: "returning",
      label:
        depositPercentages.returning === null
          ? "Recurrente (depósito sin configurar)"
          : `Recurrente (${depositPercentages.returning}% depósito)`,
    },
  ];
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof verifyImportCustomerStatusAction>> | null, formData: FormData) => {
      const newStatus = formData.get("new_status") as string;
      const result = await verifyImportCustomerStatusAction(customerId, newStatus);
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
    <section className={styles.section} aria-labelledby="verify-heading">
      <div className={styles.sectionTitle}>
        <h2 id="verify-heading">Estado de verificación</h2>
      </div>
      <p style={{ fontSize: 12, color: "#5c574f", marginBottom: 12 }}>
        El estado determina la política de depósito activa:{" "}
        <strong>Nuevo/Pendiente = {depositPercentages.new === null ? "sin configurar" : `${depositPercentages.new}%`}</strong>,{" "}
        <strong>Recurrente = {depositPercentages.returning === null ? "sin configurar" : `${depositPercentages.returning}%`}</strong>.
      </p>
      {state?.status === "success" ? (
        <p className={styles.savedNote} role="status" aria-live="polite">{state.message}</p>
      ) : state?.status === "error" ? (
        <p className={styles.conflictBanner} role="alert">{state.message}</p>
      ) : null}
      <form action={formAction} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {statusOptions.map((opt) => (
          <button
            key={opt.value}
            type="submit"
            name="new_status"
            value={opt.value}
            className={opt.value === currentStatus ? styles.primaryButton : styles.secondaryButton}
            disabled={isPending || opt.value === currentStatus}
          >
            {opt.label}
            {opt.value === currentStatus ? " (actual)" : ""}
          </button>
        ))}
      </form>
    </section>
  );
}
