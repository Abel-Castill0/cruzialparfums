"use client";

import { useActionState, useState } from "react";
import { adminButtonClass } from "@/components/admin/admin-ui";
import {
  deleteDeliveryZoneAction,
  deleteShippingAgencyAction,
  saveDeliveryZoneAction,
  saveGiftExclusionAction,
  saveShippingAgencyAction,
  type RulesActionState,
} from "./actions";
import styles from "./reglas.module.css";

const initial: RulesActionState = { status: "idle" };

export type ZoneRow = { id: string; district: string; isRestricted: boolean; updatedAt: string };
export type AgencyRow = { id: string; name: string; coverage: string; description: string; isActive: boolean; updatedAt: string };
export type GiftCandidate = { id: string; label: string };

function Feedback({ state }: { state: RulesActionState }) {
  return (
    <p className={styles.feedback} role={state.status === "error" ? "alert" : "status"} data-state={state.status}>
      {state.status === "idle" ? "" : state.message}
    </p>
  );
}

function DeleteControl({ label, action }: { label: string; action: (previous: RulesActionState, formData: FormData) => Promise<RulesActionState> }) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className={adminButtonClass("quiet")} onClick={() => setOpen(true)}>Eliminar</button>;
  return (
    <form action={formAction} className={styles.confirm}>
      <label><input name="confirmDelete" type="checkbox" required /> Confirmo eliminar {label}</label>
      <button type="submit" className={adminButtonClass("danger")} disabled={pending}>{pending ? "Eliminando…" : "Eliminar"}</button>
      <button type="button" className={adminButtonClass("quiet")} onClick={() => setOpen(false)}>Cancelar</button>
      <Feedback state={state} />
    </form>
  );
}

export function DeliveryZoneRow({ zone, canEdit }: { zone: ZoneRow; canEdit: boolean }) {
  const [state, formAction, pending] = useActionState(saveDeliveryZoneAction.bind(null, zone.id, zone.updatedAt), initial);
  return (
    <li className={styles.row} data-zone={zone.district}>
      <form action={formAction} className={styles.inline}>
        <label className={styles.grow}>
          <span className={styles.label}>Distrito</span>
          <input name="district" required minLength={2} maxLength={80} defaultValue={zone.district} disabled={!canEdit || pending} />
        </label>
        <label className={styles.check}>
          <input name="isRestricted" type="checkbox" defaultChecked={zone.isRestricted} disabled={!canEdit || pending} />
          Sin motorizado
        </label>
        {canEdit ? <button type="submit" className={adminButtonClass("secondary")} disabled={pending}>{pending ? "Guardando…" : "Guardar"}</button> : null}
        <Feedback state={state} />
      </form>
      {canEdit ? <DeleteControl label={zone.district} action={deleteDeliveryZoneAction.bind(null, zone.id)} /> : null}
    </li>
  );
}

export function NewDeliveryZone() {
  const [state, formAction, pending] = useActionState(saveDeliveryZoneAction.bind(null, "", ""), initial);
  return (
    <form action={formAction} className={`${styles.inline} ${styles.newRow}`}>
      <label className={styles.grow}>
        <span className={styles.label}>Nuevo distrito</span>
        <input name="district" required minLength={2} maxLength={80} placeholder="Ej. Callao" disabled={pending} />
      </label>
      <label className={styles.check}><input name="isRestricted" type="checkbox" disabled={pending} /> Sin motorizado</label>
      <button type="submit" className={adminButtonClass("primary")} disabled={pending}>{pending ? "Agregando…" : "Agregar distrito"}</button>
      <Feedback state={state} />
    </form>
  );
}

export function ShippingAgencyRow({ agency, canEdit }: { agency: AgencyRow; canEdit: boolean }) {
  const [state, formAction, pending] = useActionState(saveShippingAgencyAction.bind(null, agency.id, agency.updatedAt), initial);
  return (
    <li className={styles.row} data-agency={agency.name}>
      <form action={formAction} className={styles.stack}>
        <label><span className={styles.label}>Nombre</span><input name="name" required maxLength={80} defaultValue={agency.name} disabled={!canEdit || pending} /></label>
        <label><span className={styles.label}>Cobertura</span><input name="coverage" required maxLength={120} defaultValue={agency.coverage} disabled={!canEdit || pending} /></label>
        <label><span className={styles.label}>Descripción</span><input name="description" maxLength={240} defaultValue={agency.description} disabled={!canEdit || pending} /></label>
        <label className={styles.check}><input name="isActive" type="checkbox" defaultChecked={agency.isActive} disabled={!canEdit || pending} /> Activa</label>
        {canEdit ? <div className={styles.actions}><button type="submit" className={adminButtonClass("secondary")} disabled={pending}>{pending ? "Guardando…" : "Guardar agencia"}</button></div> : null}
        <Feedback state={state} />
      </form>
      {canEdit ? <DeleteControl label={agency.name} action={deleteShippingAgencyAction.bind(null, agency.id)} /> : null}
    </li>
  );
}

export function NewShippingAgency() {
  const [state, formAction, pending] = useActionState(saveShippingAgencyAction.bind(null, "", ""), initial);
  return (
    <form action={formAction} className={`${styles.stack} ${styles.newRow}`}>
      <label><span className={styles.label}>Nueva agencia</span><input name="name" required maxLength={80} placeholder="Nombre" disabled={pending} /></label>
      <label><span className={styles.label}>Cobertura</span><input name="coverage" required maxLength={120} placeholder="Ej. Lima y provincias" disabled={pending} /></label>
      <label><span className={styles.label}>Descripción</span><input name="description" maxLength={240} placeholder="Ej. Cotización por WhatsApp" disabled={pending} /></label>
      <label className={styles.check}><input name="isActive" type="checkbox" defaultChecked disabled={pending} /> Activa</label>
      <div className={styles.actions}><button type="submit" className={adminButtonClass("primary")} disabled={pending}>{pending ? "Agregando…" : "Agregar agencia"}</button></div>
      <Feedback state={state} />
    </form>
  );
}

export function GiftExclusionForm({
  ruleId,
  updatedAt,
  candidates,
  excluded,
  canEdit,
}: {
  ruleId: string;
  updatedAt: string;
  candidates: GiftCandidate[];
  excluded: string[];
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveGiftExclusionAction.bind(null, ruleId, updatedAt), initial);
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const selected = new Set(excluded);
  return (
    <form action={formAction} className={styles.stack}>
      <label>
        <span className={styles.label}>Buscar perfume árabe</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o marca" />
      </label>
      <fieldset className={styles.checklist}>
        <legend className={styles.label}>Perfumes que no participan en el regalo de 2 ml</legend>
        {candidates.map((candidate) => (
          <label
            key={candidate.id}
            className={styles.check}
            // Hidden rows stay in the form so a filter never drops a saved exclusion.
            hidden={Boolean(normalized) && !candidate.label.toLowerCase().includes(normalized)}
          >
            <input type="checkbox" name="excluded" value={candidate.id} defaultChecked={selected.has(candidate.id)} disabled={!canEdit || pending} />
            {candidate.label}
          </label>
        ))}
        {candidates.length === 0 ? <p>No hay perfumes árabes publicados todavía.</p> : null}
      </fieldset>
      {canEdit ? <div className={styles.actions}><button type="submit" className={adminButtonClass("primary")} disabled={pending}>{pending ? "Guardando…" : "Guardar exclusiones"}</button></div> : null}
      <Feedback state={state} />
    </form>
  );
}
