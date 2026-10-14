"use client";

import { useActionState } from "react";
import { adminButtonClass } from "@/components/admin/admin-ui";
import type { MixedWholesaleRule } from "@/domains/commercial/rule-forms";
import { saveMixedWholesaleRuleAction, type MixedWholesaleState } from "./mixed-rule-actions";

const initial: MixedWholesaleState = { status: "idle" };
const LABELS = { arabic: "Árabe", designer: "Diseñador", niche: "Nicho" } as const;

export function MixedWholesaleRuleForm({ rule, canEdit }: { rule: MixedWholesaleRule | null; canEdit: boolean }) {
  const [state, formAction, pending] = useActionState(saveMixedWholesaleRuleAction.bind(null, rule?.id ?? "", rule?.updatedAt ?? ""), initial);
  return (
    <form action={formAction} style={{ display: "grid", gap: 14, padding: 20, border: "1px solid var(--admin-border, #d7dce2)", borderRadius: 12, maxWidth: 420 }}>
      <h2>Regla mixta</h2>
      <label style={{ display: "grid", gap: 6 }}>
        Unidades mixtas para el descuento
        <input name="minUnits" type="number" min="1" max="9999" step="1" required defaultValue={rule?.minUnits} disabled={!canEdit || pending} />
      </label>
      {(Object.keys(LABELS) as Array<keyof typeof LABELS>).map((type) => (
        <label key={type} style={{ display: "grid", gap: 6 }}>
          Descuento por frasco {LABELS[type].toLowerCase()} (S/)
          <input name={type} type="number" min="0.01" max="1000" step="0.01" required defaultValue={rule?.discounts[type]} disabled={!canEdit || pending} />
        </label>
      ))}
      <label><input name="isActive" type="checkbox" defaultChecked={rule?.isActive ?? true} disabled={!canEdit || pending} /> Regla activa</label>
      {state.status === "error" ? <p role="alert">{state.message}</p> : null}
      {state.status === "success" ? <p role="status">Regla guardada.</p> : null}
      {canEdit ? <button type="submit" className={adminButtonClass("primary")} disabled={pending}>{pending ? "Guardando…" : rule ? "Guardar regla" : "Crear regla"}</button> : null}
    </form>
  );
}
