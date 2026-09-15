"use client";

import { useState, useTransition } from "react";
import type { ComboRow } from "@/domains/admin-parfums/combos-repository";
import {
  ADMIN_EDITABLE_VERIFICATION_STATUS_LABELS,
  VERIFICATION_STATUS_LABELS,
  isAdminEditableVerificationStatus,
  type AdminEditableCompositionVerificationStatus,
} from "@/domains/admin-parfums/combo-schema";
import { archiveComboAction, restoreComboAction, updateVerificationAction } from "../actions";
import formStyles from "@/components/admin/product-form-fields.module.css";
import styles from "../../productos/page.module.css";

/**
 * Verification status + archive/restore. Composition lives in
 * CompositionManager — kept as a separate component/section so the admin
 * never confuses "confirm this composition" with "edit these items".
 *
 * Controlled by the parent (ComboWorkspace): `combo` is the single shared
 * copy of the row, and every successful mutation here calls `onChange`
 * instead of keeping a private copy, so CompositionManager (which mutates
 * the same row's `updated_at`) always sees the current concurrency token too.
 */
export function ComboEditor({
  combo,
  onChange,
  disabled,
}: {
  combo: ComboRow;
  onChange: (next: ComboRow) => void;
  disabled: boolean;
}) {
  const initialEditableStatus = isAdminEditableVerificationStatus(combo.composition_verification_status)
    ? combo.composition_verification_status
    : "pending_reconfirmation";
  const [status, setStatus] = useState<AdminEditableCompositionVerificationStatus>(initialEditableStatus);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [archivePending, setArchivePending] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const isOfficialPdf = combo.composition_verification_status === "official_pdf";
  const dirty = !isOfficialPdf && status !== combo.composition_verification_status;
  const isArchived = combo.archived_at !== null;

  function handleSaveVerification() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateVerificationAction(combo.id, combo.updated_at, status);
      if (result.status === "success") {
        onChange(result.data);
        setSaved(true);
      } else if (result.status === "error") {
        setError(result.message);
      } else if (result.status === "field_errors") {
        setError(Object.values(result.errors)[0] ?? "Estado inválido.");
      }
    });
  }

  async function toggleArchive() {
    setArchivePending(true);
    setArchiveError(null);
    const result = isArchived
      ? await restoreComboAction(combo.id, combo.updated_at)
      : await archiveComboAction(combo.id, combo.updated_at);
    if (result.status === "success") {
      onChange(result.data);
      if (isAdminEditableVerificationStatus(result.data.composition_verification_status)) {
        setStatus(result.data.composition_verification_status);
      }
    } else if (result.status === "error") {
      setArchiveError(result.message);
    }
    setArchivePending(false);
  }

  const busy = isPending || archivePending;

  return (
    <section className={styles.section} aria-labelledby="combo-title">
      <div className={styles.sectionTitle}>
        <h2 id="combo-title">Combo</h2>
      </div>

      {isArchived ? (
        <p className={styles.notice} role="status">
          Este combo está archivado. Restáuralo para volver a editar su verificación o composición.
        </p>
      ) : null}
      {error ? <p className={formStyles.error} role="alert">{error}</p> : null}
      {archiveError ? <p className={formStyles.error} role="alert">{archiveError}</p> : null}
      {saved ? <p className={styles.savedNote} role="status">Guardado.</p> : null}

      <div className={formStyles.grid}>
        {isOfficialPdf ? (
          <div className={formStyles.field}>
            <span>Estado de verificación de la composición</span>
            <p className={styles.notice} role="status">
              {VERIFICATION_STATUS_LABELS.official_pdf} — autoridad de fuente, no editable manualmente.
            </p>
          </div>
        ) : (
        <label className={formStyles.field}>
          <span>Estado de verificación de la composición</span>
          <select
            value={status}
            onChange={(event) => {
              if (isAdminEditableVerificationStatus(event.target.value)) setStatus(event.target.value);
              setSaved(false);
            }}
            disabled={disabled || busy || isArchived}
          >
            {Object.entries(ADMIN_EDITABLE_VERIFICATION_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <p className={formStyles.hint}>
            Cambiar a &quot;Confirmado por cliente&quot; es una acción explícita del administrador — nunca se infiere
            automáticamente por tener ítems en la composición.
          </p>
        </label>
        )}
      </div>

      <div className={`${styles.formActions} ${styles.spacingTop}`}>
        {!disabled && !isOfficialPdf ? (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleSaveVerification}
            disabled={busy || !dirty || isArchived}
          >
            {isPending ? "Guardando…" : "Guardar verificación"}
          </button>
        ) : null}
        {!disabled ? (
          <button type="button" className={styles.dangerButton} onClick={toggleArchive} disabled={busy}>
            {isArchived
              ? (archivePending ? "Restaurando…" : "Restaurar combo")
              : (archivePending ? "Archivando…" : "Archivar combo")}
          </button>
        ) : null}
      </div>
    </section>
  );
}
