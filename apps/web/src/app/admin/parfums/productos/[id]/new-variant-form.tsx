"use client";

import { useActionState, useEffect } from "react";
import type { Database } from "@/lib/supabase/database.types";
import { createVariantAction, type ActionState } from "../actions";
import formStyles from "@/components/admin/product-form-fields.module.css";
import styles from "../page.module.css";

type VariantRow = Database["public"]["Tables"]["product_variants"]["Row"];

const initialState: ActionState<VariantRow> = { status: "idle" };

export function NewVariantForm({
  productId,
  onCreated,
}: {
  productId: string;
  onCreated: () => void;
}) {
  const boundAction = createVariantAction.bind(null, productId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  useEffect(() => {
    if (state.status === "success") onCreated();
    // onCreated is a fresh closure from the parent each render (it toggles
    // local state there) — only react to a real state transition, not to a
    // new function identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const errors = state.status === "field_errors" ? state.errors : {};

  return (
    <form action={formAction} className={styles.section} aria-busy={pending}>
      {state.status === "error" ? (
        <p className={formStyles.error} role="alert">{state.message}</p>
      ) : null}
      <div className={formStyles.grid}>
        <label className={formStyles.field}>
          <span>Nombre *</span>
          <input name="label" placeholder="3 ml" required maxLength={60} aria-invalid={!!errors.label} aria-describedby={errors.label ? "new-variant-label-error" : undefined} />
          {errors.label ? <p id="new-variant-label-error" className={formStyles.error} role="alert">{errors.label}</p> : null}
        </label>
        <label className={formStyles.field}>
          <span>Tipo</span>
          <select name="variantKind" defaultValue="decant" aria-invalid={!!errors.variantKind} aria-describedby={errors.variantKind ? "new-variant-kind-error" : undefined}>
            <option value="decant">Decant</option>
            <option value="bottle">Frasco</option>
          </select>
          {errors.variantKind ? <p id="new-variant-kind-error" className={formStyles.error} role="alert">{errors.variantKind}</p> : null}
        </label>
        <label className={formStyles.field}>
          <span>Tamaño (ml)</span>
          <input name="sizeMl" type="number" step="0.01" min="0.01" placeholder="3" aria-invalid={!!errors.sizeMl} aria-describedby={errors.sizeMl ? "new-variant-size-error" : undefined} />
          {errors.sizeMl ? <p id="new-variant-size-error" className={formStyles.error} role="alert">{errors.sizeMl}</p> : null}
        </label>
        <label className={formStyles.field}>
          <span>Precio *</span>
          <input name="priceAmount" type="number" step="0.01" min="0" required aria-invalid={!!errors.priceAmount} aria-describedby={errors.priceAmount ? "new-variant-price-error" : undefined} />
          {errors.priceAmount ? <p id="new-variant-price-error" className={formStyles.error} role="alert">{errors.priceAmount}</p> : null}
        </label>
        <label className={formStyles.field}>
          <span>Moneda</span>
          <input name="currency" defaultValue="PEN" maxLength={3} aria-invalid={!!errors.currency} aria-describedby={errors.currency ? "new-variant-currency-error" : undefined} />
          {errors.currency ? <p id="new-variant-currency-error" className={formStyles.error} role="alert">{errors.currency}</p> : null}
        </label>
        <label className={formStyles.field}>
          <span>SKU</span>
          <input name="sku" maxLength={60} aria-invalid={!!errors.sku} aria-describedby={errors.sku ? "new-variant-sku-error" : undefined} />
          {errors.sku ? <p id="new-variant-sku-error" className={formStyles.error} role="alert">{errors.sku}</p> : null}
        </label>
        <label className={formStyles.field}>
          <span>Publicación</span>
          <select name="publicationStatus" defaultValue="draft" aria-invalid={!!errors.publicationStatus} aria-describedby={errors.publicationStatus ? "new-variant-publication-error" : undefined}>
            <option value="draft">Borrador</option>
            <option value="published">Publicado</option>
          </select>
          {errors.publicationStatus ? <p id="new-variant-publication-error" className={formStyles.error} role="alert">{errors.publicationStatus}</p> : null}
        </label>
        <label className={formStyles.field}>
          <span>Orden</span>
          <input name="sortOrder" type="number" step="1" defaultValue={0} aria-invalid={!!errors.sortOrder} aria-describedby={errors.sortOrder ? "new-variant-sort-error" : undefined} />
          {errors.sortOrder ? <p id="new-variant-sort-error" className={formStyles.error} role="alert">{errors.sortOrder}</p> : null}
        </label>
        <label className={formStyles.field}>
          <span>Modo de inventario</span>
          <select name="inventoryMode" defaultValue="status_only" aria-invalid={!!errors.inventoryMode} aria-describedby={errors.inventoryMode ? "new-variant-inventory-mode-error" : undefined}>
            <option value="status_only">Solo estado</option>
            <option value="tracked_quantity">Cantidad controlada</option>
          </select>
          {errors.inventoryMode ? <p id="new-variant-inventory-mode-error" className={formStyles.error} role="alert">{errors.inventoryMode}</p> : null}
        </label>
        <label className={formStyles.field}>
          <span>Disponibilidad</span>
          <select name="availabilityStatus" defaultValue="available" aria-invalid={!!errors.availabilityStatus} aria-describedby={errors.availabilityStatus ? "new-variant-availability-error" : undefined}>
            <option value="available">Disponible</option>
            <option value="out_of_stock">Agotado</option>
          </select>
          {errors.availabilityStatus ? <p id="new-variant-availability-error" className={formStyles.error} role="alert">{errors.availabilityStatus}</p> : null}
        </label>
        <label className={formStyles.field}>
          <span>Cantidad en stock</span>
          <input
            name="quantityOnHand"
            type="number"
            step="1"
            min="0"
            aria-invalid={!!errors.quantityOnHand}
            aria-describedby={`new-variant-quantity-hint${errors.quantityOnHand ? " new-variant-quantity-error" : ""}`}
          />
          <p id="new-variant-quantity-hint" className={formStyles.hint}>Solo si el modo es &quot;cantidad controlada&quot;.</p>
          {errors.quantityOnHand ? <p id="new-variant-quantity-error" className={formStyles.error} role="alert">{errors.quantityOnHand}</p> : null}
        </label>
      </div>
      <div className={`${styles.formActions} ${styles.spacingTop}`}>
        <button type="submit" className={styles.primaryButton} disabled={pending}>
          {pending ? "Creando…" : "Crear variante"}
        </button>
      </div>
    </form>
  );
}
