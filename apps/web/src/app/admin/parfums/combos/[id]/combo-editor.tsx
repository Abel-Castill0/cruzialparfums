"use client";

import { useState, useTransition } from "react";
import type { ComboRow } from "@/domains/admin-parfums/combos-repository";
import {
  ADMIN_EDITABLE_VERIFICATION_STATUSES,
  isAdminEditableVerificationStatus,
  type AdminEditableCompositionVerificationStatus,
} from "@/domains/admin-parfums/combo-schema";
import {
  COMBO_VERIFICATION_EXPLANATIONS,
  COMBO_VERIFICATION_OWNER_LABELS,
  comboVerificationLabel,
  comboVerificationTone,
} from "@/domains/admin-parfums/combo-presentation";
import {
  AdminSection,
  Notice,
  SaveStatus,
  StatusBadge,
  adminButtonClass,
  type SaveStatusState,
} from "@/components/admin/admin-ui";
import { archiveComboAction, restoreComboAction, updateVerificationAction } from "../actions";
import styles from "@/components/admin/catalog-workspace.module.css";
import comboStyles from "../combos.module.css";

/**
 * Composition verification. Kept apart from CompositionManager so the admin
 * never confuses "confirm this composition" with "edit these items".
 *
 * Controlled by the parent (ComboWorkspace): `combo` is the single shared
 * copy of the row, and every successful mutation here calls `onChange`
 * instead of keeping a private copy, so CompositionManager (which mutates
 * the same row's `updated_at`) always sees the current concurrency token too.
 *
 * - official_pdf is source authority: shown read-only, never a control.
 * - client_confirmed is only ever chosen explicitly, and additionally needs
 *   an explicit acknowledgement before it can be saved.
 */
export function ComboVerificationEditor({
  combo,
  onChange,
  canWrite,
  compositionDirty,
}: {
  combo: ComboRow;
  onChange: (next: ComboRow) => void;
  canWrite: boolean;
  compositionDirty: boolean;
}) {
  const current = combo.composition_verification_status;
  const isOfficialPdf = current === "official_pdf";
  const isArchived = combo.archived_at !== null;
  const [status, setStatus] = useState<AdminEditableCompositionVerificationStatus>(
    isAdminEditableVerificationStatus(current) ? current : "pending_reconfirmation",
  );
  const [acknowledged, setAcknowledged] = useState(false);
  // Follow the shared row: when the persisted status changes (this save, or a
  // restore), reset the local choice to it without remounting, so the
  // "saved" feedback below stays announced.
  const [syncedStatus, setSyncedStatus] = useState(current);
  if (syncedStatus !== current) {
    setSyncedStatus(current);
    setStatus(isAdminEditableVerificationStatus(current) ? current : "pending_reconfirmation");
    setAcknowledged(false);
  }
  const [isPending, startTransition] = useTransition();
  const [saveState, setSaveState] = useState<SaveStatusState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  const dirty = !isOfficialPdf && status !== current;
  const needsAcknowledgement = dirty && status === "client_confirmed";
  const blockedByComposition = dirty && compositionDirty;
  const canSave = canWrite && !isArchived && dirty && !isPending && !blockedByComposition && (!needsAcknowledgement || acknowledged);

  function choose(next: AdminEditableCompositionVerificationStatus) {
    setStatus(next);
    setAcknowledged(false);
    setErrorMessage(undefined);
    setSaveState(next === current ? "idle" : "dirty");
  }

  function handleSave() {
    if (!canSave) return;
    setSaveState("saving");
    setErrorMessage(undefined);
    startTransition(async () => {
      const result = await updateVerificationAction(combo.id, combo.updated_at, status);
      if (result.status === "success") {
        onChange(result.data);
        setSaveState("saved");
      } else if (result.status === "error") {
        setErrorMessage(`Error — no se guardó. ${result.message}`);
        setSaveState("error");
      } else if (result.status === "field_errors") {
        setErrorMessage(`Error — no se guardó. ${Object.values(result.errors)[0] ?? "Estado inválido."}`);
        setSaveState("error");
      }
    });
  }

  return (
    <AdminSection
      id="verificacion-seccion"
      title="Verificación de la composición"
      description="Indica si alguien con autoridad confirmó qué incluye este combo. Solo una composición verificada puede aparecer en la tienda."
    >
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <p className={styles.cardTitle}>Estado actual</p>
          <StatusBadge tone={comboVerificationTone(current)}>{comboVerificationLabel(current)}</StatusBadge>
        </div>

        {isOfficialPdf ? (
          <Notice tone="healthy" title="Verificada por fuente oficial">
            {COMBO_VERIFICATION_EXPLANATIONS.official_pdf}
          </Notice>
        ) : (
          <>
            <p className={styles.muted}>
              {isAdminEditableVerificationStatus(current) ? COMBO_VERIFICATION_EXPLANATIONS[current] : null}
            </p>
            {canWrite ? (
              <>
                {isArchived ? (
                  <Notice tone="neutral" title="El combo está archivado">
                    Restáuralo en “Opciones avanzadas” para cambiar su verificación.
                  </Notice>
                ) : null}
                <fieldset className={comboStyles.choiceGroup} disabled={isArchived || isPending}>
                  <legend>Cambiar estado</legend>
                  {ADMIN_EDITABLE_VERIFICATION_STATUSES.map((value) => (
                    <label key={value} className={comboStyles.choice}>
                      <input
                        type="radio"
                        name={`verification-${combo.id}`}
                        value={value}
                        checked={status === value}
                        onChange={() => choose(value)}
                      />
                      <span>
                        <strong>{COMBO_VERIFICATION_OWNER_LABELS[value]}</strong>
                        {value === current ? <span className={styles.muted}> (actual)</span> : null}
                      </span>
                    </label>
                  ))}
                </fieldset>

                {needsAcknowledgement ? (
                  <label className={`${styles.check} ${comboStyles.acknowledge}`}>
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(event) => setAcknowledged(event.target.checked)}
                    />
                    <span>
                      Confirmo que el cliente revisó y aprobó exactamente la composición guardada de este combo.
                    </span>
                  </label>
                ) : null}

                {blockedByComposition ? (
                  <Notice tone="attention" title="Guarda primero la composición">
                    La verificación se aplica a la composición guardada. Guarda o descarta los cambios de la composición
                    antes de cambiar su verificación.
                  </Notice>
                ) : null}

                <div className={styles.actionsRow}>
                  <button type="button" className={adminButtonClass("primary")} onClick={handleSave} disabled={!canSave}>
                    {isPending ? "Guardando…" : "Guardar verificación"}
                  </button>
                  <SaveStatus
                    state={saveState}
                    message={saveState === "saved" ? "Verificación guardada" : saveState === "error" ? errorMessage : undefined}
                  />
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </AdminSection>
  );
}

/** Archive/restore. Archiving asks for an explicit second step and states
 * the real consequence: only `combos.archived_at` changes — the product is
 * never archived or deleted by this action. */
export function ComboArchiveControl({
  combo,
  onChange,
  canWrite,
}: {
  combo: ComboRow;
  onChange: (next: ComboRow) => void;
  canWrite: boolean;
}) {
  const isArchived = combo.archived_at !== null;
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [saveState, setSaveState] = useState<SaveStatusState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  async function run(kind: "archive" | "restore") {
    setPending(true);
    setSaveState("saving");
    setErrorMessage(undefined);
    const result = kind === "archive"
      ? await archiveComboAction(combo.id, combo.updated_at)
      : await restoreComboAction(combo.id, combo.updated_at);
    if (result.status === "success") {
      onChange(result.data);
      setConfirming(false);
      setSaveState("saved");
    } else if (result.status === "error") {
      setErrorMessage(`Error — no se guardó. ${result.message}`);
      setSaveState("error");
    }
    setPending(false);
  }

  const savedMessage = isArchived ? "Combo archivado" : "Combo restaurado";

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <p className={styles.cardTitle}>{isArchived ? "Combo archivado" : "Archivar combo"}</p>
        {isArchived ? <StatusBadge tone="neutral">Archivado</StatusBadge> : null}
      </div>
      <p className={styles.muted}>
        {isArchived
          ? "Un combo archivado no puede mostrarse en la tienda y su composición no se puede editar. Al restaurarlo vuelve a evaluarse con las mismas condiciones."
          : "Archiva el combo si ya no se vende. El combo dejará de poder mostrarse públicamente. El producto asociado no se elimina ni se archiva."}
      </p>
      {canWrite ? (
        isArchived ? (
          <div className={styles.actionsRow}>
            <button type="button" className={adminButtonClass("secondary")} onClick={() => run("restore")} disabled={pending}>
              {pending ? "Restaurando…" : "Restaurar combo"}
            </button>
            <SaveStatus state={saveState} message={saveState === "saved" ? savedMessage : saveState === "error" ? errorMessage : undefined} />
          </div>
        ) : confirming ? (
          <div className={comboStyles.confirm} role="group" aria-label="Confirmar archivo del combo">
            <p><strong>¿Archivar este combo?</strong></p>
            <p className={styles.muted}>
              Dejará de poder mostrarse en la tienda. El producto asociado no se elimina ni se archiva. Puedes restaurarlo después.
            </p>
            <div className={styles.actionsRow}>
              <button type="button" className={adminButtonClass("danger")} onClick={() => run("archive")} disabled={pending}>
                {pending ? "Archivando…" : "Sí, archivar combo"}
              </button>
              <button type="button" className={adminButtonClass("quiet")} onClick={() => setConfirming(false)} disabled={pending}>
                Cancelar
              </button>
              <SaveStatus state={saveState === "error" ? "error" : "idle"} message={errorMessage} />
            </div>
          </div>
        ) : (
          <div className={styles.actionsRow}>
            <button type="button" className={adminButtonClass("secondary")} onClick={() => { setConfirming(true); setSaveState("idle"); }}>
              Archivar combo…
            </button>
            <SaveStatus state={saveState} message={saveState === "saved" ? savedMessage : undefined} />
          </div>
        )
      ) : null}
    </div>
  );
}
