"use client";

import { useActionState, useState } from "react";
import type { WholesalePolicyRow } from "@/domains/admin-parfums/wholesale-repository";
import type { WholesaleCommercialType } from "@/domains/admin-parfums/wholesale-schema";
import { policyMeaning, summarizePolicy } from "@/domains/admin-parfums/wholesale-presentation";
import {
  Notice,
  SaveStatus,
  StatusBadge,
  adminButtonClass,
  type SaveStatusState,
} from "@/components/admin/admin-ui";
import {
  updateWholesalePolicyAction,
  type WholesalePolicyActionState,
} from "./actions";
import catalogStyles from "@/components/admin/catalog-workspace.module.css";
import styles from "./wholesale.module.css";

const initialState: WholesalePolicyActionState = { status: "idle" };

function discountText(value: number | null): string {
  return value === null ? "" : value.toFixed(2);
}

/**
 * One commercial-type rule. Reads as a summary; editing is an explicit mode
 * with Guardar/Cancelar. The stored values are the only defaults — a missing
 * value stays empty instead of being replaced by a historical number.
 * Optimistic concurrency: the action is bound to the row's current
 * `updated_at`, refreshed from every successful save.
 */
export function WholesalePolicyEditor({
  policy,
  fallbackType,
  canWrite,
}: {
  policy: WholesalePolicyRow;
  fallbackType: WholesaleCommercialType;
  canWrite: boolean;
}) {
  const [current, setCurrent] = useState(policy);
  const [editing, setEditing] = useState(false);
  const [minQuantity, setMinQuantity] = useState(current.min_quantity === null ? "" : String(current.min_quantity));
  const [discount, setDiscount] = useState(discountText(current.discount_amount));
  const [isActive, setIsActive] = useState(current.is_active);
  const [disableAcknowledged, setDisableAcknowledged] = useState(false);
  const [feedback, setFeedback] = useState<"idle" | "saved" | "error">("idle");
  const [handledState, setHandledState] = useState<WholesalePolicyActionState>(initialState);
  const boundAction = updateWholesalePolicyAction.bind(null, current.id, current.updated_at);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "error" || state.status === "field_errors") setFeedback("error");
    if (state.status === "success") {
      setCurrent(state.data);
      setMinQuantity(state.data.min_quantity === null ? "" : String(state.data.min_quantity));
      setDiscount(discountText(state.data.discount_amount));
      setIsActive(state.data.is_active);
      setDisableAcknowledged(false);
      setEditing(false);
      setFeedback("saved");
    }
  }

  const summary = summarizePolicy(current, fallbackType);
  const headingId = `policy-${current.id}-title`;
  const errors = state.status === "field_errors" ? state.errors : {};
  const dirty =
    minQuantity !== (current.min_quantity === null ? "" : String(current.min_quantity))
    || discount !== discountText(current.discount_amount)
    || isActive !== current.is_active;
  const disabling = current.is_active && !isActive;
  const canSubmit = dirty && !pending && (!disabling || disableAcknowledged);

  const saveState: SaveStatusState = pending
    ? "saving"
    : feedback === "error"
      ? "error"
      : editing && dirty
        ? "dirty"
        : feedback === "saved" ? "saved" : "idle";
  const saveMessage =
    saveState === "saved"
      ? "Política guardada"
      : saveState === "error"
        ? state.status === "error"
          ? `Error — no se guardó. ${state.message}`
          : "Error — no se guardó. Revisa los valores marcados."
        : undefined;

  function cancel() {
    setMinQuantity(current.min_quantity === null ? "" : String(current.min_quantity));
    setDiscount(discountText(current.discount_amount));
    setIsActive(current.is_active);
    setDisableAcknowledged(false);
    setEditing(false);
    setFeedback("idle");
  }

  return (
    <article className={`${styles.policyCard} ${summary.complete && summary.active ? "" : styles.policyInactive}`} aria-labelledby={headingId}>
      <div className={styles.policyHeading}>
        <h3 id={headingId}>{summary.label}</h3>
        {summary.complete ? (
          <StatusBadge tone={summary.active ? "healthy" : "neutral"}>{summary.active ? "Activa" : "Desactivada"}</StatusBadge>
        ) : (
          <StatusBadge tone="danger">Configuración incompleta</StatusBadge>
        )}
      </div>

      {!editing ? (
        <>
          {summary.complete ? (
            <dl className={styles.policyFacts}>
              <div>
                <dt>Pedido mínimo</dt>
                <dd>{summary.minQuantity} frascos</dd>
              </div>
              <div>
                <dt>Descuento por frasco</dt>
                <dd>{summary.discountText}</dd>
              </div>
            </dl>
          ) : (
            <Notice tone="danger" title="Falta configuración de la regla">
              Falta {summary.missing.join(" y ")}. No mostramos ningún valor por defecto.
            </Notice>
          )}
          <p className={styles.meaning}>{policyMeaning(summary)}</p>
          {canWrite ? (
            <div className={catalogStyles.actionsRow}>
              <button
                type="button"
                className={adminButtonClass("secondary")}
                onClick={() => { setEditing(true); setFeedback("idle"); }}
                aria-describedby={headingId}
              >
                Editar condiciones
              </button>
              <SaveStatus state={saveState} message={saveMessage} />
            </div>
          ) : null}
        </>
      ) : (
        <form action={formAction} className={styles.policyForm} aria-busy={pending}>
          {state.status === "error" ? (
            <Notice tone="danger" title="No se guardó">{state.message}</Notice>
          ) : null}
          <label className={catalogStyles.field}>
            <span>Pedido mínimo (frascos {summary.label})</span>
            <input
              name="minQuantity"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              required
              value={minQuantity}
              onChange={(event) => { setMinQuantity(event.target.value); setFeedback("idle"); }}
              disabled={pending}
              aria-invalid={Boolean(errors.minQuantity)}
              aria-describedby={errors.minQuantity ? `${headingId}-min-error` : undefined}
            />
            {errors.minQuantity ? <span id={`${headingId}-min-error`} className={styles.fieldError}>{errors.minQuantity}</span> : null}
          </label>
          <label className={catalogStyles.field}>
            <span>Descuento por frasco (S/)</span>
            <input
              name="discountAmount"
              type="text"
              inputMode="decimal"
              required
              value={discount}
              onChange={(event) => { setDiscount(event.target.value); setFeedback("idle"); }}
              disabled={pending}
              aria-invalid={Boolean(errors.discountAmount)}
              aria-describedby={errors.discountAmount ? `${headingId}-discount-error` : undefined}
            />
            {errors.discountAmount ? <span id={`${headingId}-discount-error`} className={styles.fieldError}>{errors.discountAmount}</span> : null}
          </label>
          <label className={catalogStyles.check}>
            <input
              name="isActive"
              type="checkbox"
              checked={isActive}
              onChange={(event) => { setIsActive(event.target.checked); setDisableAcknowledged(false); setFeedback("idle"); }}
              disabled={pending}
            />
            <span>Regla activa</span>
          </label>
          {disabling ? (
            <div className={styles.confirmDisable}>
              <p>
                <strong>Vas a desactivar la regla {summary.label}.</strong> Sus frascos dejarán de ser elegibles para
                Mayorista (“Política desactivada”) y la tienda dejará de mostrar esta regla.
              </p>
              <label className={catalogStyles.check}>
                <input
                  type="checkbox"
                  checked={disableAcknowledged}
                  onChange={(event) => setDisableAcknowledged(event.target.checked)}
                />
                <span>Entiendo y quiero desactivarla</span>
              </label>
            </div>
          ) : null}
          <div className={catalogStyles.actionsRow}>
            <button className={adminButtonClass(disabling ? "danger" : "primary")} type="submit" disabled={!canSubmit}>
              {pending ? "Guardando…" : disabling ? "Desactivar regla" : "Guardar"}
            </button>
            <button type="button" className={adminButtonClass("quiet")} onClick={cancel} disabled={pending}>
              Cancelar
            </button>
            <SaveStatus state={saveState} message={saveMessage} />
          </div>
        </form>
      )}
    </article>
  );
}
