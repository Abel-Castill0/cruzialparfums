"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { AdminSection, Disclosure, Notice, adminButtonClass } from "@/components/admin/admin-ui";
import { CampaignFormFields } from "@/components/admin/campaign-form-fields";
import type { CampaignRow } from "@/domains/admin-import/campaigns-repository";
import type {
  CampaignProductItem,
  EligibleImportProduct,
} from "@/domains/admin-import/campaign-products-repository";
import type { CampaignProductAvailability } from "@/domains/admin-import/campaign-products-schema";
import { isoToLimaDatetimeLocal, type CampaignStatus } from "@/domains/admin-import/campaign-schema";
import {
  archiveCampaignAction,
  setCampaignStatusAction,
  updateCampaignAction,
  type CampaignActionState,
} from "../actions";
import { CampaignLifecycleControl, type PendingPreparationStep } from "./campaign-lifecycle-control";
import { CampaignProductsManager } from "./campaign-products-manager";
import { DuplicateCampaignControl } from "./duplicate-campaign-control";
import formStyles from "@/components/admin/product-form-fields.module.css";
import workspace from "@/components/admin/order-workspace.module.css";

const initialState: CampaignActionState = { status: "idle" };

/** One client tree so every mutation shares the same optimistic-concurrency
 * version (updated_at). Each section is still its own explicit action:
 * saving dates never changes the status, and the status never changes
 * products. After a confirmed save the server-rendered summary above is
 * refreshed — nothing is shown as done before the server confirms it. */
export function CampaignEditor({
  campaign,
  campaignProducts,
  eligibleProducts,
  disabled,
  readyForManualOpen,
  pendingSteps,
  dateExplanation,
  initialAvailabilityFilter,
}: {
  campaign: CampaignRow;
  campaignProducts: CampaignProductItem[];
  eligibleProducts: EligibleImportProduct[];
  disabled: boolean;
  readyForManualOpen: boolean | null;
  pendingSteps: readonly PendingPreparationStep[];
  dateExplanation: string;
  initialAvailabilityFilter: "all" | CampaignProductAvailability;
}) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [current, setCurrent] = useState(campaign);
  const boundUpdate = updateCampaignAction.bind(null, current.id, current.updated_at);
  const [state, formAction, pending] = useActionState(boundUpdate, initialState);
  const [statusState, setStatusState] = useState<CampaignActionState>({ status: "idle" });
  const [statusPending, setStatusPending] = useState(false);
  const [archiveState, setArchiveState] = useState<CampaignActionState>({ status: "idle" });
  const [archivePending, setArchivePending] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [productCount, setProductCount] = useState(campaignProducts.length);
  const [handledState, setHandledState] = useState(state);

  function refreshSummary() {
    startRefresh(() => router.refresh());
  }

  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") setCurrent({ ...current, ...state.data });
  }

  // Refresh the server-rendered summary (hero, dates, checklist) only after
  // the server confirmed the save — as an effect, never during render.
  useEffect(() => {
    if (state.status === "success") startRefresh(() => router.refresh());
  }, [state, router]);

  async function changeStatus(target: CampaignStatus) {
    setStatusPending(true);
    try {
      const result = await setCampaignStatusAction(current.id, current.updated_at, target);
      setStatusState(result);
      if (result.status === "success") {
        setCurrent({ ...current, ...result.data });
        refreshSummary();
      }
    } catch {
      setStatusState({ status: "error", message: "No pudimos cambiar el estado. Recarga la página e inténtalo otra vez." });
    } finally {
      setStatusPending(false);
    }
  }

  async function archive() {
    setArchivePending(true);
    try {
      const result = await archiveCampaignAction(current.id, current.updated_at);
      setArchiveState(result);
      if (result.status === "success") {
        setCurrent({ ...current, ...result.data });
        setConfirmArchive(false);
        refreshSummary();
      }
    } catch {
      setArchiveState({ status: "error", message: "No pudimos archivar el consolidado. Recarga la página e inténtalo otra vez." });
    } finally {
      setArchivePending(false);
    }
  }

  const errors = state.status === "field_errors" ? state.errors : {};
  const isArchived = current.archived_at !== null;
  const isBusy = pending || statusPending || archivePending;
  const fieldsDisabled = disabled || isBusy || isArchived;

  return (
    <>
      {isArchived ? (
        <Notice tone="neutral" title="Consolidado archivado">
          Queda como historial. No puede editarse ni cambiar de estado, y no hay restauración disponible.
        </Notice>
      ) : null}

      {/* Products (4J2) — full-replace save, never a side effect of the
          status or the dates below. */}
      <div id="productos" className={workspace.anchorTarget}>
        <CampaignProductsManager
          campaignId={current.id}
          campaignUpdatedAt={current.updated_at}
          campaignStatus={current.status}
          campaignArchivedAt={current.archived_at}
          onUpdatedAtChange={(updatedAt) => setCurrent((previous) => ({ ...previous, updated_at: updatedAt }))}
          onSavedCountChange={(count) => {
            setProductCount(count);
            refreshSummary();
          }}
          items={campaignProducts}
          eligibleProducts={eligibleProducts}
          disabled={disabled || isArchived}
          initialAvailabilityFilter={initialAvailabilityFilter}
        />
      </div>

      <AdminSection
        id="fechas"
        title="Apertura y cierre"
        description="Nombre, fechas públicas y mensaje para tus clientes. Guardar esta sección nunca cambia el estado."
      >
        <Notice tone="neutral" title="Las fechas no cambian el estado">{dateExplanation}</Notice>
        <form action={formAction} className={workspace.actionPanel} aria-busy={pending}>
          {state.status === "error" ? <p className={workspace.feedbackError} role="alert">{state.message}</p> : null}
          {state.status === "success" ? <p className={workspace.feedbackSuccess} role="status">✓ Cambios guardados.</p> : null}

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

          {!disabled && !isArchived ? (
            <div>
              <button type="submit" className={adminButtonClass("primary")} disabled={fieldsDisabled}>
                {pending ? "Guardando…" : "Guardar datos y fechas"}
              </button>
            </div>
          ) : null}
        </form>
      </AdminSection>

      {/* Explicit lifecycle control — never a side effect of the forms. */}
      <AdminSection
        id="estado"
        title="Estado del consolidado"
        description="El estado solo cambia cuando tú lo decides."
      >
        <CampaignLifecycleControl
          campaignId={current.id}
          status={current.status}
          archived={isArchived}
          readOnly={disabled}
          busy={isBusy}
          readyForManualOpen={readyForManualOpen}
          pendingSteps={pendingSteps}
          productCount={productCount}
          result={statusState}
          onChange={changeStatus}
        />
      </AdminSection>

      {!disabled ? (
        <AdminSection id="mas-acciones" title="Más acciones">
          <Disclosure summary="Duplicar o archivar este consolidado" hint="Acciones poco frecuentes">
            {/* Duplicate — admin only, never rendered for a viewer. */}
            <DuplicateCampaignControl campaignId={current.id} />

            {/* Archive — no delete, no restore in this phase. */}
            {!isArchived ? (
              <div className={workspace.secondaryActions}>
                {archiveState.status === "error" ? <p className={formStyles.error} role="alert">{archiveState.message}</p> : null}
                {confirmArchive ? (
                  <div className={workspace.dangerConfirm} role="group" aria-label="Confirmar archivo">
                    <strong className={workspace.dangerTitle}>Archivar consolidado: ¿confirmas?</strong>
                    <p className={workspace.consequence}>
                      Queda como historial: ya no podrá editarse, abrirse ni restaurarse. Los pedidos existentes no cambian.
                    </p>
                    <div className={workspace.dangerButtons}>
                      <button type="button" className={adminButtonClass("danger")} disabled={isBusy} onClick={archive}>
                        {archivePending ? "Archivando…" : "Sí, archivar consolidado"}
                      </button>
                      <button type="button" className={adminButtonClass("quiet")} disabled={isBusy} onClick={() => setConfirmArchive(false)}>
                        Volver sin cambios
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <button type="button" className={adminButtonClass("danger")} disabled={isBusy} onClick={() => setConfirmArchive(true)}>
                      Archivar consolidado
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </Disclosure>
        </AdminSection>
      ) : null}
    </>
  );
}
