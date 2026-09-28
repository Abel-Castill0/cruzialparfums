"use client";

import { useActionState, useState } from "react";
import type { EligibleProduct } from "@/domains/admin-parfums/combos-repository";
import {
  ADMIN_EDITABLE_VERIFICATION_STATUSES,
  type AdminEditableCompositionVerificationStatus,
} from "@/domains/admin-parfums/combo-schema";
import { COMBO_VERIFICATION_OWNER_LABELS } from "@/domains/admin-parfums/combo-presentation";
import { Notice, adminButtonClass } from "@/components/admin/admin-ui";
import { createComboAction, type ComboActionState } from "../actions";
import styles from "@/components/admin/catalog-workspace.module.css";
import comboStyles from "../combos.module.css";

const initialState: ComboActionState = { status: "idle" };

/** Default stays pending_reconfirmation; "Confirmada por cliente" is only an
 * explicit choice and, like on the detail page, needs an acknowledgement. */
export function NewComboForm({ eligibleProducts }: { eligibleProducts: EligibleProduct[] }) {
  const [state, formAction, pending] = useActionState(createComboAction, initialState);
  const [verification, setVerification] = useState<AdminEditableCompositionVerificationStatus>("pending_reconfirmation");
  const [acknowledged, setAcknowledged] = useState(false);
  const errors = state.status === "field_errors" ? state.errors : {};
  const needsAcknowledgement = verification === "client_confirmed";

  return (
    <form action={formAction} className={styles.card} aria-busy={pending}>
      {state.status === "error" ? <Notice tone="danger" title="No se creó el combo">{state.message}</Notice> : null}

      <fieldset className={comboStyles.choiceGroup} disabled={pending}>
        <legend className={styles.cardTitle}>1. Producto que representa el combo</legend>
        <label className={styles.field}>
          <span>Producto Parfums *</span>
          <select
            name="productId"
            required
            defaultValue=""
            aria-invalid={!!errors.productId}
            aria-describedby={errors.productId ? "err-productId" : "hint-productId"}
          >
            <option value="" disabled>Selecciona un producto…</option>
            {eligibleProducts.map((product) => (
              <option key={product.id} value={product.id}>
                {product.brand ? `${product.brand} — ` : ""}{product.name}
              </option>
            ))}
          </select>
          {errors.productId ? (
            <span id="err-productId" className={comboStyles.fieldError} role="alert">{errors.productId}</span>
          ) : (
            <span id="hint-productId" className={styles.fieldHint}>
              Nombre, precio, fotos y publicación pertenecen a este producto y se editan en Productos, no aquí.
            </span>
          )}
        </label>
      </fieldset>

      <fieldset
        className={comboStyles.choiceGroup}
        disabled={pending}
        aria-describedby={errors.compositionVerificationStatus ? "err-verification" : "hint-verification"}
      >
        <legend className={styles.cardTitle}>2. Estado inicial de la composición</legend>
        <p id="hint-verification" className={styles.muted}>
          Si nadie confirmó todavía qué incluye el combo, deja “{COMBO_VERIFICATION_OWNER_LABELS.pending_reconfirmation}”.
        </p>
        {ADMIN_EDITABLE_VERIFICATION_STATUSES.map((value) => (
          <label key={value} className={comboStyles.choice}>
            <input
              type="radio"
              name="compositionVerificationStatus"
              value={value}
              checked={verification === value}
              onChange={() => { setVerification(value); setAcknowledged(false); }}
            />
            <span>
              <strong>{COMBO_VERIFICATION_OWNER_LABELS[value]}</strong>
              {value === "pending_reconfirmation" ? <span className={styles.muted}> (recomendado)</span> : null}
            </span>
          </label>
        ))}
        {errors.compositionVerificationStatus ? (
          <span id="err-verification" className={comboStyles.fieldError} role="alert">{errors.compositionVerificationStatus}</span>
        ) : null}
        {needsAcknowledgement ? (
          <label className={`${styles.check} ${comboStyles.acknowledge}`}>
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
            <span>Confirmo que el cliente aprobó la composición que voy a registrar para este combo.</span>
          </label>
        ) : null}
      </fieldset>

      <p className={styles.muted}>
        3. Al crearlo te llevaremos al combo para definir su composición. Nada se publica automáticamente.
      </p>

      <div className={styles.actionsRow}>
        <button type="submit" className={adminButtonClass("primary")} disabled={pending || (needsAcknowledgement && !acknowledged)}>
          {pending ? "Creando…" : "Crear combo"}
        </button>
      </div>
    </form>
  );
}
