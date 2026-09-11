"use client";

import { useRouter } from "next/navigation";
import { useActionState, useTransition } from "react";
import { createCustomerFromOrderAction } from "../../clientes/customer-actions";
import styles from "../../productos/page.module.css";

type LinkedCustomer = {
  id: string;
  full_name: string;
  phone: string | null;
  verified_customer_status: string;
  archived_at: string | null;
};

type Props = {
  orderId: string;
  customerId: string | null;
  linkedCustomer: LinkedCustomer | null;
  orderPhone: string | null;
  orderName: string | null;
};

export function CustomerLinkingSection({ orderId, customerId, linkedCustomer, orderPhone, orderName }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [state, formAction, isPending] = useActionState(
    async () => {
      const result = await createCustomerFromOrderAction(orderId);
      if (result.status === "success") {
        startTransition(() => {
          router.refresh();
        });
      }
      return result;
    },
    null,
  );

  if (customerId && linkedCustomer) {
    return (
      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <h2>Cliente vinculado</h2>
        </div>
        <dl className={styles.detailList}>
          <div><dt>Nombre</dt><dd>{linkedCustomer.full_name}</dd></div>
          <div><dt>Teléfono</dt><dd>{linkedCustomer.phone || "—"}</dd></div>
          <div><dt>Estado verificado</dt><dd>{linkedCustomer.verified_customer_status}</dd></div>
          <div>
            <dt>Enlace</dt>
            <dd>
              <a href={`/admin/import/clientes/${linkedCustomer.id}`}>Ver cliente →</a>
            </dd>
          </div>
        </dl>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <div className={styles.sectionTitle}>
        <h2>Vinculación de cliente</h2>
      </div>
      <p style={{ fontSize: 13, color: "#5c574f", marginBottom: 12 }}>
        Este pedido no tiene un cliente registrado. Puedes crear uno usando los datos del pedido
        ({orderName || "Sin nombre"} · {orderPhone || "Sin teléfono"}).
      </p>
      {state?.status === "success" ? (
        <p className={styles.savedNote} role="status" aria-live="polite">{state.message}</p>
      ) : state?.status === "error" ? (
        <p className={styles.conflictBanner} role="alert">{state.message}</p>
      ) : null}
      <form action={formAction}>
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={isPending}
        >
          {isPending ? "Procesando..." : "Registrar y vincular cliente"}
        </button>
      </form>
    </section>
  );
}
