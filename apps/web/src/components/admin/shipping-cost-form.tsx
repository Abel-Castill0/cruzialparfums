"use client";

import { useActionState } from "react";
import { setOrderShippingCostAction, type ShippingCostState } from "@/app/admin/parfums/pedidos/shipping-cost-actions";
import { adminButtonClass } from "./admin-ui";
import workspace from "./order-workspace.module.css";

const initial: ShippingCostState = { status: "idle" };

/** The fee quoted over WhatsApp, in soles. It is stored in cents and never added to the order subtotal. */
export function ShippingCostForm({ orderId, cents, canEdit }: { orderId: string; cents: number | null; canEdit: boolean }) {
  const [state, formAction, pending] = useActionState(setOrderShippingCostAction.bind(null, orderId), initial);
  const current = cents === null ? "" : (cents / 100).toFixed(2);
  return (
    <form action={formAction} className={workspace.shippingCost}>
      <label>
        Costo de envío cotizado (S/)
        <input name="shippingCost" inputMode="decimal" autoComplete="off" defaultValue={current} placeholder="Sin cotizar" disabled={!canEdit || pending} aria-describedby="shipping-cost-help" />
      </label>
      <p id="shipping-cost-help" className={workspace.readOnlyNote}>Se guarda aparte: no cambia el total del pedido. Déjalo vacío para borrarlo.</p>
      {canEdit ? <button type="submit" className={adminButtonClass("secondary")} disabled={pending}>{pending ? "Guardando…" : "Guardar costo de envío"}</button> : null}
      <p role={state.status === "error" ? "alert" : "status"}>{state.status === "idle" ? "" : state.message}</p>
    </form>
  );
}
