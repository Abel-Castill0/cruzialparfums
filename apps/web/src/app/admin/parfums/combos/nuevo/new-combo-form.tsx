"use client";

import { useActionState } from "react";
import type { EligibleProduct } from "@/domains/admin-parfums/combos-repository";
import { VERIFICATION_STATUS_LABELS } from "@/domains/admin-parfums/combo-schema";
import { createComboAction, type ComboActionState } from "../actions";
import formStyles from "@/components/admin/product-form-fields.module.css";
import styles from "../../productos/page.module.css";

const initialState: ComboActionState = { status: "idle" };

export function NewComboForm({ eligibleProducts }: { eligibleProducts: EligibleProduct[] }) {
  const [state, formAction, pending] = useActionState(createComboAction, initialState);
  const errors = state.status === "field_errors" ? state.errors : {};

  return (
    <form action={formAction} className={styles.formWrapper} aria-busy={pending}>
      {state.status === "error" ? <p className={formStyles.error} role="alert">{state.message}</p> : null}

      <fieldset className={formStyles.fieldset} disabled={pending}>
        <legend className={formStyles.legend}>Producto y verificación</legend>

        <div className={formStyles.grid}>
          <label className={formStyles.field}>
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
                  {product.brand ? `${product.brand} — ` : ""}{product.name} ({product.slug})
                </option>
              ))}
            </select>
            {errors.productId ? (
              <p id="err-productId" className={formStyles.error} role="alert">{errors.productId}</p>
            ) : (
              <p id="hint-productId" className={formStyles.hint}>
                El combo hereda nombre, precio y publicación de este producto — se editan en Productos, no aquí.
              </p>
            )}
          </label>

          <label className={formStyles.field}>
            <span>Estado de verificación</span>
            <select
              name="compositionVerificationStatus"
              defaultValue="pending_reconfirmation"
              aria-invalid={!!errors.compositionVerificationStatus}
              aria-describedby={errors.compositionVerificationStatus ? "err-verification" : "hint-verification"}
            >
              {Object.entries(VERIFICATION_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            {errors.compositionVerificationStatus ? (
              <p id="err-verification" className={formStyles.error} role="alert">{errors.compositionVerificationStatus}</p>
            ) : (
              <p id="hint-verification" className={formStyles.hint}>
                &quot;Confirmado por cliente&quot; es una acción explícita — no se infiere por tener ítems.
              </p>
            )}
          </label>
        </div>
      </fieldset>

      <div className={styles.formActions}>
        <button type="submit" className={styles.primaryButton} disabled={pending}>
          {pending ? "Creando…" : "Crear combo"}
        </button>
      </div>
    </form>
  );
}
