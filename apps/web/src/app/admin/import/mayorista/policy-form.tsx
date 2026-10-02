"use client";

import { useActionState } from "react";
import type { Database } from "@/lib/supabase/database.types";
import { updateImportWholesalePolicy, type ImportWholesaleActionState } from "./actions";

type Policy = Database["public"]["Tables"]["wholesale_policies"]["Row"];
const initial: ImportWholesaleActionState = { status: "idle" };

export function ImportWholesalePolicyForm({ policy, label, canEdit }: { policy: Policy; label: string; canEdit: boolean }) {
  const action = updateImportWholesalePolicy.bind(null, policy.id, policy.updated_at);
  const [state, formAction, pending] = useActionState(action, initial);
  return <form action={formAction} style={{ display: "grid", alignContent: "start", gap: 14, padding: 20, border: "1px solid var(--admin-border, #d7dce2)", borderRadius: 12 }}>
    <h2>{label}</h2>
    <label style={{ display: "grid", gap: 6 }}>Mínimo de frascos<input name="minQuantity" type="number" min="1" max="1000000" required defaultValue={policy.min_quantity ?? ""} disabled={!canEdit || pending} /></label>
    <label style={{ display: "grid", gap: 6 }}>Descuento por frasco (S/)<input name="discountAmount" type="number" min="0.01" max="100000" step="0.01" required defaultValue={policy.discount_amount ?? ""} disabled={!canEdit || pending} /></label>
    <label><input name="isActive" type="checkbox" defaultChecked={policy.is_active} disabled={!canEdit || pending} /> Regla activa</label>
    <label><input name="confirmDisable" type="checkbox" disabled={!canEdit || pending} /> Confirmo la desactivación si dejo esta regla inactiva</label>
    <p>{policy.is_active ? "La regla aparece como vigente." : "La regla está desactivada."}</p>
    {state.status === "error" ? <p role="alert">{state.message}</p> : null}
    {state.status === "success" ? <p role="status">Regla guardada.</p> : null}
    {canEdit ? <button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar regla"}</button> : null}
  </form>;
}
