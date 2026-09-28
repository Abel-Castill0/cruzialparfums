"use client";

import { useRouter } from "next/navigation";
import { useActionState, useTransition } from "react";
import { createCustomerFromOrderAction } from "../../clientes/customer-actions";
import { importCustomerStatusLabel } from "@/domains/admin-import/import-status";
import { ActionLink, AdminSection, FactList, adminButtonClass } from "@/components/admin/admin-ui";
import workspace from "@/components/admin/order-workspace.module.css";

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
  /** Viewer: show the linked customer, never the create/link control. */
  readOnly?: boolean;
};

export function CustomerLinkingSection({ orderId, customerId, linkedCustomer, orderPhone, orderName, readOnly = false }: Props) {
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
      <AdminSection id="cliente-registrado" title="Cliente registrado">
        <FactList
          items={[
            { term: "Nombre", value: linkedCustomer.full_name },
            ...(readOnly ? [] : [{ term: "Teléfono", value: linkedCustomer.phone || "Sin teléfono" }]),
            { term: "Verificación", value: importCustomerStatusLabel(linkedCustomer.verified_customer_status) },
          ]}
        />
        <div className={workspace.contactActions}>
          <ActionLink href={`/admin/import/clientes/${linkedCustomer.id}`} variant="secondary">Ver ficha del cliente</ActionLink>
        </div>
      </AdminSection>
    );
  }

  if (readOnly) return null;

  return (
    <AdminSection
      id="cliente-registrado"
      title="Cliente registrado"
      description="Este pedido todavía no está vinculado a un cliente registrado."
    >
      <p className={workspace.consequence}>
        Al registrarlo se crea la ficha del cliente con los datos del pedido ({orderName || "Sin nombre"} · {orderPhone || "Sin teléfono"}) y se vincula a este pedido.
      </p>
      {state?.status === "success" ? (
        <p className={workspace.feedbackSuccess} role="status">✓ {state.message}</p>
      ) : state?.status === "error" ? (
        <p className={workspace.feedbackError} role="alert">{state.message}</p>
      ) : null}
      <form action={formAction}>
        <button type="submit" className={adminButtonClass("secondary")} disabled={isPending}>
          {isPending ? "Registrando…" : "Registrar y vincular cliente"}
        </button>
      </form>
    </AdminSection>
  );
}
