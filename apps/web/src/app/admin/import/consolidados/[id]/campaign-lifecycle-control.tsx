"use client";

import { useId, useState } from "react";
import { ActionLink, Disclosure, Notice, StatusBadge, adminButtonClass } from "@/components/admin/admin-ui";
import {
  campaignStatusPresentation,
  recommendedLifecycleActions,
  type LifecycleAction,
} from "@/domains/admin-import/campaign-presentation";
import { CAMPAIGN_STATUSES, campaignStatusLabel, type CampaignStatus } from "@/domains/admin-import/campaign-schema";
import type { CampaignActionState } from "../actions";
import workspace from "@/components/admin/order-workspace.module.css";

export type PendingPreparationStep = { key: string; title: string; detail: string };

type Props = {
  campaignId: string;
  status: string;
  archived: boolean;
  readOnly: boolean;
  busy: boolean;
  /** readiness.ready_for_manual_open; null = could not be verified. */
  readyForManualOpen: boolean | null;
  pendingSteps: readonly PendingPreparationStep[];
  productCount: number;
  result: CampaignActionState;
  onChange: (target: CampaignStatus) => Promise<void>;
};

function manualAction(target: CampaignStatus, readyForManualOpen: boolean | null): LifecycleAction {
  return {
    target,
    label: `Cambiar a “${campaignStatusLabel(target)}”`,
    consequence: campaignStatusPresentation(target).publicConsequence,
    variant: "secondary",
    warnNotReady: target === "open" && readyForManualOpen !== true,
  };
}

/** Status changes stay explicit, confirmed actions on the existing
 * setCampaignStatusAction. Opening an unready consolidado is warned about,
 * but NOT blocked: the server (admin_set_campaign_status) does not enforce
 * readiness today, and the UI must not pretend otherwise. */
export function CampaignLifecycleControl(props: Props) {
  const { status, archived, readOnly, busy, readyForManualOpen, pendingSteps, productCount } = props;
  const [confirming, setConfirming] = useState<LifecycleAction | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [manualTarget, setManualTarget] = useState<CampaignStatus | "">("");
  const baseId = useId();
  const presentation = campaignStatusPresentation(status);
  const recommended = recommendedLifecycleActions({ status, archived, readyForManualOpen });

  function ask(action: LifecycleAction) {
    setAcknowledged(false);
    setConfirming(action);
  }

  async function confirm() {
    if (!confirming) return;
    await props.onChange(confirming.target);
    setConfirming(null);
    setManualTarget("");
  }

  const confirmPanel = confirming ? (
    <div className={workspace.dangerConfirm} role="group" aria-labelledby={`${baseId}-confirm-title`}>
      <strong id={`${baseId}-confirm-title`} className={workspace.dangerTitle}>
        {confirming.label}: ¿confirmas el cambio?
      </strong>
      <p className={workspace.consequence}>{confirming.consequence}</p>
      {confirming.warnNotReady ? (
        <>
          <Notice
            tone="attention"
            title={readyForManualOpen === null ? "No pudimos verificar si está listo" : "Todavía no está listo para abrirse"}
            action={<ActionLink href={`/admin/import/publicacion?campaign=${props.campaignId}`} variant="secondary">Revisar bloqueadores</ActionLink>}
          >
            {pendingSteps.length > 0 ? (
              <ul className={workspace.pendingList}>
                {pendingSteps.map((step) => (
                  <li key={step.key}><strong>{step.title}:</strong> {step.detail}</li>
                ))}
              </ul>
            ) : (
              <p>Revisa la preparación antes de abrirlo.</p>
            )}
            {productCount === 0 ? <p>Este consolidado no tiene productos: tus clientes verían un catálogo vacío.</p> : null}
          </Notice>
          <label className={workspace.checkboxField}>
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={busy} />
            <span>Entiendo que mis clientes podrían ver un catálogo incompleto o sin disponibilidad confirmada.</span>
          </label>
        </>
      ) : null}
      <div className={workspace.dangerButtons}>
        <button
          type="button"
          className={adminButtonClass(confirming.variant === "danger" ? "danger" : "primary")}
          disabled={busy || (confirming.warnNotReady && !acknowledged)}
          onClick={confirm}
        >
          {busy ? "Actualizando…" : confirming.warnNotReady ? "Abrir de todos modos" : `Sí, ${confirming.label.toLowerCase()}`}
        </button>
        <button type="button" className={adminButtonClass("quiet")} disabled={busy} onClick={() => setConfirming(null)}>
          Volver sin cambios
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className={workspace.actionPanel}>
      <p className={workspace.statusLine}>
        <StatusBadge tone={presentation.tone}>{presentation.label}</StatusBadge>
        <span>{presentation.description}</span>
      </p>

      {props.result.status === "error" ? <p className={workspace.feedbackError} role="alert">{props.result.message}</p> : null}
      {props.result.status === "success" ? <p className={workspace.feedbackSuccess} role="status">✓ Estado actualizado.</p> : null}

      {readOnly ? (
        <p className={workspace.readOnlyNote}>Acceso de solo lectura: solo un administrador puede cambiar el estado.</p>
      ) : archived ? (
        <p className={workspace.readOnlyNote}>Un consolidado archivado no puede cambiar de estado.</p>
      ) : (
        <>
          {confirming ? (
            confirmPanel
          ) : recommended.length > 0 ? (
            <div className={workspace.contactActions}>
              {recommended.map((action) => (
                <button
                  key={action.target}
                  type="button"
                  className={adminButtonClass(action.variant)}
                  disabled={busy}
                  onClick={() => ask(action)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : (
            <p className={workspace.readOnlyNote}>No hay un cambio de estado recomendado para este consolidado.</p>
          )}

          <Disclosure summary="Cambiar estado manualmente" hint="Todos los estados disponibles, para casos especiales">
            <p className={workspace.consequence}>
              Cualquier cambio de estado es inmediato y se registra en la auditoría. El estado nunca cambia solo por las fechas.
            </p>
            <div className={workspace.contactActions}>
              <label className={workspace.selectField}>
                <span>Nuevo estado</span>
                <select
                  value={manualTarget}
                  disabled={busy || confirming !== null}
                  onChange={(event) => setManualTarget(event.target.value as CampaignStatus | "")}
                >
                  <option value="">Selecciona un estado…</option>
                  {CAMPAIGN_STATUSES.filter((candidate) => candidate !== status).map((candidate) => (
                    <option key={candidate} value={candidate}>{campaignStatusLabel(candidate)}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={adminButtonClass("secondary")}
                disabled={busy || manualTarget === "" || confirming !== null}
                onClick={() => manualTarget && ask(manualAction(manualTarget, readyForManualOpen))}
              >
                Revisar cambio
              </button>
            </div>
            {manualTarget ? (
              <p className={workspace.consequence}>
                Con “{campaignStatusLabel(manualTarget)}”: {campaignStatusPresentation(manualTarget).publicConsequence}
              </p>
            ) : null}
          </Disclosure>
        </>
      )}
    </div>
  );
}
