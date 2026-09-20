"use client";

import { useActionState, useState } from "react";
import { duplicateCampaignAction, type DuplicateCampaignActionState } from "../actions";
import formStyles from "@/components/admin/product-form-fields.module.css";
import styles from "@/app/admin/parfums/productos/page.module.css";

const initialState: DuplicateCampaignActionState = { status: "idle" };

/**
 * "Duplicar consolidado" (4J2 correction — deferred 4J1 scope). Admin only:
 * the parent CampaignEditor never renders this for a viewer (disabled).
 * Asks only nuevo número + nuevo nombre — everything else
 * (business_unit_id/status/actor/currency/quantity_limit) is fixed
 * server-side by admin_duplicate_campaign, never client input. On success
 * the action redirects to the new campaign's own detail page.
 */
export function DuplicateCampaignControl({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const boundAction = duplicateCampaignAction.bind(null, campaignId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const errors = state.status === "field_errors" ? state.errors : {};

  if (!open) {
    return (
      <section className={styles.section} aria-label="Duplicar consolidado">
        <button type="button" className={styles.secondaryButton} onClick={() => setOpen(true)}>
          Duplicar consolidado
        </button>
      </section>
    );
  }

  return (
    <section className={styles.section} aria-label="Duplicar consolidado">
      <h2>Duplicar consolidado</h2>
      <p className={styles.notice}>
        Crea un nuevo consolidado en <strong>Borrador</strong> y copia sus productos, precios y disponibilidad.
        Conserva internamente el límite de cantidad de cada línea si ya lo tenía, pero no lo expone para editar.
        Las fechas de apertura/cierre y el mensaje público se reinician (quedan vacíos). Nada se publica
        automáticamente: el nuevo consolidado se abre solo cuando tú decidas cambiarle el estado.
      </p>
      {state.status === "error" ? <p className={formStyles.error} role="alert">{state.message}</p> : null}
      <form action={formAction} aria-busy={pending}>
        <div className={formStyles.grid}>
          <label className={formStyles.field}>
            <span>Nuevo número</span>
            <input type="number" name="newNumber" min={1} step={1} required disabled={pending} />
            {errors.newNumber ? <span className={formStyles.error}>{errors.newNumber}</span> : null}
          </label>
          <label className={formStyles.field}>
            <span>Nuevo nombre</span>
            <input type="text" name="newName" maxLength={200} required disabled={pending} />
            {errors.newName ? <span className={formStyles.error}>{errors.newName}</span> : null}
          </label>
        </div>
        <div className={styles.formActions}>
          <button type="submit" className={styles.primaryButton} disabled={pending}>
            {pending ? "Duplicando…" : "Crear duplicado"}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}
