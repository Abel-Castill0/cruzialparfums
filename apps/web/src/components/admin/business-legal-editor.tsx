"use client";

import { useActionState, useState } from "react";
import type { BusinessLegalSetting } from "@/domains/admin-parfums/settings-repository";
import type { FieldErrors } from "@/domains/admin-parfums/product-schema";
import {
  FactList,
  Notice,
  SaveStatus,
  StatusBadge,
  adminButtonClass,
  type SaveStatusState,
} from "./admin-ui";
import catalogStyles from "./catalog-workspace.module.css";
import styles from "./settings-workspace.module.css";

export type BusinessLegalSettingActionState =
  | { status: "idle" }
  | { status: "success"; data: BusinessLegalSetting }
  | { status: "field_errors"; errors: FieldErrors }
  | { status: "error"; message: string };

const initialState: BusinessLegalSettingActionState = { status: "idle" };

const BLANK = <span className={catalogStyles.muted}>No configurado</span>;

/**
 * Shared by Parfums and Import — one settings row, one RPC, one save; the
 * three fieldsets below are presentation grouping only, not separate
 * mutations. Mirrors public-business-legal.tsx's own grouping exactly:
 * identity + address always show on /privacidad and /terminos; the two
 * policy texts only show on /terminos; claims contact feeds both those
 * pages and the public Libro de Reclamaciones header.
 */
export function BusinessLegalSettingEditor({
  setting,
  canWrite,
  updateAction,
}: {
  setting: BusinessLegalSetting;
  canWrite: boolean;
  updateAction: (
    expectedUpdatedAt: string,
    previous: BusinessLegalSettingActionState,
    formData: FormData,
  ) => Promise<BusinessLegalSettingActionState>;
}) {
  const [current, setCurrent] = useState(setting);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState<"idle" | "saved" | "error">("idle");
  const [handledState, setHandledState] = useState<BusinessLegalSettingActionState>(initialState);
  const boundAction = updateAction.bind(null, current.updatedAt);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "error" || state.status === "field_errors") setFeedback("error");
    if (state.status === "success") {
      setCurrent(state.data);
      setEditing(false);
      setFeedback("saved");
    }
  }

  const errors = state.status === "field_errors" ? state.errors : {};
  const saveState: SaveStatusState = pending ? "saving" : feedback === "error" ? "error" : feedback === "saved" ? "saved" : "idle";
  const saveMessage =
    saveState === "saved"
      ? "Configuración guardada"
      : saveState === "error"
        ? state.status === "error"
          ? `Error — no se guardó. ${state.message}`
          : "Error — no se guardó. Revisa los valores marcados."
        : undefined;

  const v = current.value;
  const identityComplete = Boolean(v.legalName && v.ruc && v.address);

  return (
    <div className={catalogStyles.card}>
      <div className={catalogStyles.cardHead}>
        <h3 className={catalogStyles.cardTitle}>Datos legales y reclamos</h3>
      </div>

      {!editing ? (
        <>
          <div className={styles.group}>
            <p className={styles.groupTitle}>
              Identidad legal{" "}
              {identityComplete ? (
                <StatusBadge tone="healthy">Completa</StatusBadge>
              ) : (
                <StatusBadge tone="attention">Incompleta</StatusBadge>
              )}
            </p>
            <p className={styles.groupHint}>
              Se muestra en las páginas legales públicas (privacidad, términos) y en el Libro de Reclamaciones. Sin
              estos tres datos, el Libro de Reclamaciones público le avisa al cliente que tu negocio todavía no
              completó su identificación legal — igual puede registrar su reclamo.
            </p>
            <FactList
              items={[
                { term: "Razón social", value: v.legalName || BLANK },
                { term: "RUC", value: v.ruc || BLANK },
                { term: "Dirección", value: v.address || BLANK },
              ]}
            />
          </div>

          <div className={styles.group}>
            <p className={styles.groupTitle}>Atención de reclamos</p>
            <p className={styles.groupHint}>El contacto que ve el cliente en el Libro de Reclamaciones y páginas legales.</p>
            <FactList
              items={[
                { term: "Correo para reclamos", value: v.claimsEmail || BLANK },
                { term: "Teléfono para reclamos", value: v.claimsPhone || BLANK },
              ]}
            />
          </div>

          <div className={styles.group}>
            <p className={styles.groupTitle}>Políticas públicas</p>
            <p className={styles.groupHint}>Texto que se muestra tal cual en la página de Términos.</p>
            <FactList
              items={[
                { term: "Cambios y devoluciones", value: v.exchangePolicy || BLANK },
                { term: "Formas de pago", value: v.paymentMethodsNote || BLANK },
              ]}
            />
          </div>

          {canWrite ? (
            <div className={catalogStyles.actionsRow}>
              <button
                type="button"
                className={adminButtonClass("secondary")}
                onClick={() => { setEditing(true); setFeedback("idle"); }}
              >
                Editar
              </button>
              <SaveStatus state={saveState} message={saveMessage} />
            </div>
          ) : null}
        </>
      ) : (
        <form action={formAction} aria-busy={pending}>
          {state.status === "error" ? <Notice tone="danger" title="No se guardó">{state.message}</Notice> : null}

          <p className={styles.groupTitle}>Identidad legal</p>
          <p className={styles.groupHint}>
            Déjalos en blanco si aún no los tienes — las páginas públicas simplemente omiten esa información hasta
            que la completes.
          </p>
          <div className={catalogStyles.formGrid}>
            <label className={catalogStyles.field}>
              <span>Razón social</span>
              <input name="legalName" type="text" autoComplete="off" defaultValue={v.legalName} disabled={pending} aria-invalid={Boolean(errors.legalName)} />
              {errors.legalName ? <span className={styles.fieldError}>{errors.legalName}</span> : null}
            </label>
            <label className={catalogStyles.field}>
              <span>RUC</span>
              <input name="ruc" type="text" inputMode="numeric" autoComplete="off" defaultValue={v.ruc} disabled={pending} aria-invalid={Boolean(errors.ruc)} aria-describedby="ruc-help" />
              <small id="ruc-help" className={catalogStyles.fieldHint}>11 dígitos, o déjalo en blanco.</small>
              {errors.ruc ? <span className={styles.fieldError}>{errors.ruc}</span> : null}
            </label>
            <label className={`${catalogStyles.field} ${styles.fieldFull}`}>
              <span>Dirección para reclamos</span>
              <input name="address" type="text" autoComplete="off" defaultValue={v.address} disabled={pending} aria-invalid={Boolean(errors.address)} />
              {errors.address ? <span className={styles.fieldError}>{errors.address}</span> : null}
            </label>
          </div>

          <div className={styles.group}>
            <p className={styles.groupTitle}>Atención de reclamos</p>
            <div className={catalogStyles.formGrid}>
              <label className={catalogStyles.field}>
                <span>Correo para reclamos</span>
                <input name="claimsEmail" type="email" autoComplete="off" defaultValue={v.claimsEmail} disabled={pending} aria-invalid={Boolean(errors.claimsEmail)} />
                {errors.claimsEmail ? <span className={styles.fieldError}>{errors.claimsEmail}</span> : null}
              </label>
              <label className={catalogStyles.field}>
                <span>Teléfono para reclamos</span>
                <input name="claimsPhone" type="text" autoComplete="off" defaultValue={v.claimsPhone} disabled={pending} aria-invalid={Boolean(errors.claimsPhone)} />
                {errors.claimsPhone ? <span className={styles.fieldError}>{errors.claimsPhone}</span> : null}
              </label>
            </div>
          </div>

          <div className={styles.group}>
            <p className={styles.groupTitle}>Políticas públicas</p>
            <div className={catalogStyles.formGrid}>
              <label className={`${catalogStyles.field} ${styles.fieldFull}`}>
                <span>Política de cambios/devoluciones (texto público)</span>
                <textarea name="exchangePolicy" rows={5} defaultValue={v.exchangePolicy} disabled={pending} aria-invalid={Boolean(errors.exchangePolicy)} />
                {errors.exchangePolicy ? <span className={styles.fieldError}>{errors.exchangePolicy}</span> : null}
              </label>
              <label className={`${catalogStyles.field} ${styles.fieldFull}`}>
                <span>Nota sobre formas de pago (texto público)</span>
                <textarea name="paymentMethodsNote" rows={3} defaultValue={v.paymentMethodsNote} disabled={pending} aria-invalid={Boolean(errors.paymentMethodsNote)} />
                {errors.paymentMethodsNote ? <span className={styles.fieldError}>{errors.paymentMethodsNote}</span> : null}
              </label>
            </div>
          </div>

          <div className={catalogStyles.actionsRow}>
            <button className={adminButtonClass("primary")} type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar cambios"}
            </button>
            <button
              type="button"
              className={adminButtonClass("quiet")}
              onClick={() => { setEditing(false); setFeedback("idle"); }}
              disabled={pending}
            >
              Cancelar
            </button>
            <SaveStatus state={saveState} message={saveMessage} />
          </div>
        </form>
      )}
    </div>
  );
}
