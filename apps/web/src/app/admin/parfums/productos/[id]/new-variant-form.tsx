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
          <input name="label" placeholder="3 ml" required maxLength={60} aria-invalid={!!errors.label} />
          {errors.label ? <p className={formStyles.error} role="alert">{errors.label}</p> : null}
        </label>
        <label className={formStyles.field}>
          <span>Tipo</span>
          <select name="variantKind" defaultValue="decant">
            <option value="decant">Decant</option>
            <option value="bottle">Frasco</option>
          </select>
        </label>
        <label className={formStyles.field}>
          <span>Tamaño (ml)</span>
          <input name="sizeMl" type="number" step="0.01" min="0.01" placeholder="3" />
        </label>
        <label className={formStyles.field}>
          <span>Precio *</span>
          <input name="priceAmount" type="number" step="0.01" min="0" required aria-invalid={!!errors.priceAmount} />
          {errors.priceAmount ? <p className={formStyles.error} role="alert">{errors.priceAmount}</p> : null}
        </label>
        <label className={formStyles.field}>
          <span>Moneda</span>
          <input name="currency" defaultValue="PEN" maxLength={3} />
        </label>
        <label className={formStyles.field}>
          <span>SKU</span>
          <input name="sku" maxLength={60} />
        </label>
        <label className={formStyles.field}>
          <span>Publicación</span>
          <select name="publicationStatus" defaultValue="draft">
            <option value="draft">Borrador</option>
            <option value="published">Publicado</option>
          </select>
        </label>
        <label className={formStyles.field}>
          <span>Orden</span>
          <input name="sortOrder" type="number" step="1" defaultValue={0} />
        </label>
        <label className={formStyles.field}>
          <span>Modo de inventario</span>
          <select name="inventoryMode" defaultValue="status_only">
            <option value="status_only">Solo estado</option>
            <option value="tracked_quantity">Cantidad controlada</option>
          </select>
        </label>
        <label className={formStyles.field}>
          <span>Disponibilidad</span>
          <select name="availabilityStatus" defaultValue="available">
            <option value="available">Disponible</option>
            <option value="out_of_stock">Agotado</option>
          </select>
        </label>
        <label className={formStyles.field}>
          <span>Cantidad en stock</span>
          <input
            name="quantityOnHand"
            type="number"
            step="1"
            min="0"
            aria-invalid={!!errors.quantityOnHand}
          />
          <p className={formStyles.hint}>Solo si el modo es &quot;cantidad controlada&quot;.</p>
          {errors.quantityOnHand ? <p className={formStyles.error} role="alert">{errors.quantityOnHand}</p> : null}
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
