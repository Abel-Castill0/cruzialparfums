"use client";

import { useActionState, useState } from "react";
import type { WholesalePolicyRow } from "@/domains/admin-parfums/wholesale-repository";
import {
  WHOLESALE_COMMERCIAL_TYPE_LABELS,
  isWholesaleCommercialType,
} from "@/domains/admin-parfums/wholesale-schema";
import {
  updateWholesalePolicyAction,
  type WholesalePolicyActionState,
} from "./actions";
import formStyles from "@/components/admin/product-form-fields.module.css";
import styles from "./wholesale.module.css";

const initialState: WholesalePolicyActionState = { status: "idle" };

export function WholesalePolicyEditor({
  policy,
  disabled,
}: {
  policy: WholesalePolicyRow;
  disabled: boolean;
}) {
  const [current, setCurrent] = useState(policy);
  const [handledState, setHandledState] = useState<WholesalePolicyActionState>(initialState);
  const boundAction = updateWholesalePolicyAction.bind(null, current.id, current.updated_at);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") setCurrent(state.data);
  }

  const label = isWholesaleCommercialType(current.commercial_type)
    ? WHOLESALE_COMMERCIAL_TYPE_LABELS[current.commercial_type]
    : "Sin clasificación";
  const errors = state.status === "field_errors" ? state.errors : {};

  return (
    <form action={formAction} className={styles.policyCard} aria-busy={pending}>
      <div className={styles.policyHeading}>
        <div>
          <p className={styles.eyebrow}>{current.commercial_type ?? "unknown"}</p>
          <h2>{label}</h2>
        </div>
        <span className={current.is_active ? styles.activeBadge : styles.inactiveBadge}>
          {current.is_active ? "Activa" : "Desactivada"}
        </span>
      </div>

      {state.status === "error" ? <p className={formStyles.error} role="alert">{state.message}</p> : null}
      {state.status === "success" ? <p className={styles.success} role="status">Política guardada.</p> : null}

      <div className={styles.policyFields} key={current.updated_at}>
        <label className={formStyles.field}>
          <span>Mínimo de frascos</span>
          <input
            name="minQuantity"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            defaultValue={current.min_quantity ?? 40}
            disabled={disabled || pending}
            aria-invalid={Boolean(errors.minQuantity)}
          />
          {errors.minQuantity ? <small className={formStyles.error}>{errors.minQuantity}</small> : null}
        </label>
        <label className={formStyles.field}>
          <span>Descuento por unidad (S/)</span>
          <input
            name="discountAmount"
            type="text"
            inputMode="decimal"
            defaultValue={current.discount_amount === null ? "" : String(current.discount_amount)}
            disabled={disabled || pending}
            aria-invalid={Boolean(errors.discountAmount)}
          />
          {errors.discountAmount ? <small className={formStyles.error}>{errors.discountAmount}</small> : null}
        </label>
      </div>

      <label className={styles.toggleField}>
        <input
          name="isActive"
          type="checkbox"
          defaultChecked={current.is_active}
          disabled={disabled || pending}
        />
        <span>Política habilitada</span>
      </label>

      {!disabled ? (
        <button className={styles.saveButton} type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar política"}
        </button>
      ) : null}
    </form>
  );
}
