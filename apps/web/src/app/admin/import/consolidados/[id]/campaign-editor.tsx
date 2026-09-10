"use client";

import { useActionState, useState } from "react";
import { CampaignFormFields } from "@/components/admin/campaign-form-fields";
import type { CampaignRow } from "@/domains/admin-import/campaigns-repository";
import type {
  CampaignProductItem,
  EligibleImportProduct,
} from "@/domains/admin-import/campaign-products-repository";
import {
  CAMPAIGN_STATUSES,
  campaignStatusLabel,
  isoToLimaDatetimeLocal,
  type CampaignStatus,
} from "@/domains/admin-import/campaign-schema";
import {
  archiveCampaignAction,
  setCampaignStatusAction,
  updateCampaignAction,
  type CampaignActionState,
} from "../actions";
import { CampaignProductsManager } from "./campaign-products-manager";
import { DuplicateCampaignControl } from "./duplicate-campaign-control";
import formStyles from "@/components/admin/product-form-fields.module.css";
import styles from "@/app/admin/parfums/productos/page.module.css";

const initialState: CampaignActionState = { status: "idle" };

export function CampaignEditor({
  campaign,
  campaignProducts,
  eligibleProducts,
  disabled,
}: {
  campaign: CampaignRow;
  campaignProducts: CampaignProductItem[];
  eligibleProducts: EligibleImportProduct[];
  disabled: boolean;
}) {
  const [current, setCurrent] = useState(campaign);
  const boundUpdate = updateCampaignAction.bind(null, current.id, current.updated_at);
  const [state, formAction, pending] = useActionState(boundUpdate, initialState);
  const [statusState, setStatusState] = useState<CampaignActionState>({ status: "idle" });
  const [statusPending, setStatusPending] = useState(false);
  const [nextStatus, setNextStatus] = useState<CampaignStatus>(campaign.status as CampaignStatus);
  const [archiveState, setArchiveState] = useState<CampaignActionState>({ status: "idle" });
  const [archivePending, setArchivePending] = useState(false);
  const [productCount, setProductCount] = useState(campaignProducts.length);
  const [handledState, setHandledState] = useState(state);

  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") setCurrent({ ...current, ...state.data });
  }

  async function changeStatus() {
    setStatusPending(true);
    const result = await setCampaignStatusAction(current.id, current.updated_at, nextStatus);
    setStatusState(result);
    if (result.status === "success") {
      setCurrent({ ...current, ...result.data });
      setNextStatus(result.data.status as CampaignStatus);
    }
    setStatusPending(false);
  }

  async function archive() {
    setArchivePending(true);
    const result = await archiveCampaignAction(current.id, current.updated_at);
    setArchiveState(result);
    if (result.status === "success") setCurrent({ ...current, ...result.data });
    setArchivePending(false);
  }

  const errors = state.status === "field_errors" ? state.errors : {};
  const isArchived = current.archived_at !== null;
  const isBusy = pending || statusPending || archivePending;
  const fieldsDisabled = disabled || isBusy || isArchived;
  const openingWithNoProducts = nextStatus === "open" && current.status !== "open" && productCount === 0;

  return (
    <div className={styles.section}>
      {isArchived ? (
        <p className={styles.notice} role="status">
          Este consolidado está archivado. No hay restauración disponible en esta fase; queda como historial.
        </p>
      ) : null}

      {/* ------------------------------------------------------------ */}
      {/* Explicit lifecycle control — never a side effect of the       */}
      {/* metadata form below.                                          */}
      {/* ------------------------------------------------------------ */}
      <section className={styles.section} aria-label="Estado del consolidado">
        <h2>Estado</h2>
        <p className={styles.notice}>
          Estado actual: <strong>{campaignStatusLabel(current.status)}</strong>. El estado nunca cambia solo por
          las fechas de apertura/cierre — siempre es una acción explícita.
        </p>
        {statusState.status === "error" ? <p className={formStyles.error} role="alert">{statusState.message}</p> : null}
        {statusState.status === "success" ? <p className={styles.savedNote} role="status">Estado actualizado.</p> : null}
        {!disabled && !isArchived ? (
          <div className={styles.formActions}>
            <select
              value={nextStatus}
              onChange={(event) => setNextStatus(event.target.value as CampaignStatus)}
              disabled={isBusy}
              aria-label="Nuevo estado"
            >
              {CAMPAIGN_STATUSES.map((status) => (
                <option key={status} value={status}>{campaignStatusLabel(status)}</option>
              ))}
            </select>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={changeStatus}
              disabled={isBusy || nextStatus === current.status}
            >
              {statusPending ? "Actualizando…" : "Cambiar estado"}
            </button>
          </div>
        ) : null}
        {openingWithNoProducts ? (
          <p className={formStyles.error} role="alert">
            Este consolidado no tiene productos asociados. Al quedar Abierto, la futura tienda pública de Import no
            mostrará ningún producto hasta que se agreguen (sección &ldquo;Productos del consolidado&rdquo; más abajo).
          </p>
        ) : null}
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Metadata edit                                                  */}
      {/* ------------------------------------------------------------ */}
      <form action={formAction} className={styles.section} aria-busy={pending}>
        <h2>Datos</h2>
        {state.status === "error" ? <p className={formStyles.error} role="alert">{state.message}</p> : null}
        {state.status === "success" ? <p className={styles.savedNote} role="status">Guardado.</p> : null}

        <CampaignFormFields
          key={`${current.id}-${current.archived_at ?? "active"}`}
          defaults={{
            number: String(current.number),
            name: current.name,
            opensAt: isoToLimaDatetimeLocal(current.opens_at),
            closesAt: isoToLimaDatetimeLocal(current.closes_at),
            publicMessage: current.public_message ?? "",
          }}
          errors={errors}
          disabled={fieldsDisabled}
          numberEditable={false}
        />

        <div className={styles.formActions}>
          <button type="submit" className={styles.primaryButton} disabled={fieldsDisabled}>
            {pending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>

      {/* ------------------------------------------------------------ */}
      {/* Products (4J2) — full-replace, never a side effect of Estado  */}
      {/* or Datos above.                                                */}
      {/* ------------------------------------------------------------ */}
      <CampaignProductsManager
        campaignId={current.id}
        campaignUpdatedAt={current.updated_at}
        onUpdatedAtChange={(updatedAt) => setCurrent((previous) => ({ ...previous, updated_at: updatedAt }))}
        onSavedCountChange={setProductCount}
        items={campaignProducts}
        eligibleProducts={eligibleProducts}
        disabled={disabled || isArchived}
      />

      {/* ------------------------------------------------------------ */}
      {/* Duplicate — admin only, never rendered for a viewer.           */}
      {/* ------------------------------------------------------------ */}
      {!disabled ? <DuplicateCampaignControl campaignId={current.id} /> : null}

      {/* ------------------------------------------------------------ */}
      {/* Archive — no delete, no restore in this phase.                 */}
      {/* ------------------------------------------------------------ */}
      {!disabled && !isArchived ? (
        <section className={styles.section} aria-label="Archivar consolidado">
          {archiveState.status === "error" ? <p className={formStyles.error} role="alert">{archiveState.message}</p> : null}
          <button type="button" className={styles.dangerButton} disabled={isBusy} onClick={archive}>
            {archivePending ? "Archivando…" : "Archivar consolidado"}
          </button>
        </section>
      ) : null}
    </div>
  );
}
