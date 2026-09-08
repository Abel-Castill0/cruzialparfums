"use client";

import { useActionState, useState } from "react";
import type { Database } from "@/lib/supabase/database.types";
import {
  archiveVariantAction,
  restoreVariantAction,
  updateInventoryAction,
  updateVariantAction,
  type ActionState,
} from "../actions";
import formStyles from "@/components/admin/product-form-fields.module.css";
import styles from "../page.module.css";

type VariantRowType = Database["public"]["Tables"]["product_variants"]["Row"];
type InventoryRowType = Database["public"]["Tables"]["inventory"]["Row"];

const initialVariantState: ActionState<VariantRowType> = { status: "idle" };
const initialInventoryState: ActionState<InventoryRowType> = { status: "idle" };

export function VariantRow({
  productId,
  variant: initialVariant,
  disabled,
}: {
  productId: string;
  variant: VariantRowType & { inventory: InventoryRowType | null };
  disabled: boolean;
}) {
  const [variant, setVariant] = useState(initialVariant);
  const [inventory, setInventory] = useState(initialVariant.inventory);
  const [editing, setEditing] = useState(false);
  const [archivePending, setArchivePending] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const boundUpdateVariant = updateVariantAction.bind(null, variant.id, variant.updated_at, productId);
  const [variantState, variantFormAction, variantPending] = useActionState(boundUpdateVariant, initialVariantState);

  const boundUpdateInventory = inventory
    ? updateInventoryAction.bind(null, variant.id, inventory.updated_at, productId)
    : null;
  const [inventoryState, inventoryFormAction, inventoryPending] = useActionState(
    boundUpdateInventory ?? (async (state: ActionState<InventoryRowType>) => state),
    initialInventoryState,
  );

  // "Adjusting state during render" (React docs) instead of a useEffect:
  // applied synchronously in the render that first observes a new action
  // state reference, so it never causes an extra committed render.
  const [handledVariantState, setHandledVariantState] = useState(variantState);
  if (variantState !== handledVariantState) {
    setHandledVariantState(variantState);
    if (variantState.status === "success") {
      // The RPC returns product_variants columns only; inventory is a
      // separate table/form, so the current inventory value is preserved
      // rather than dropped.
      setVariant((previous) => ({ ...variantState.data, inventory: previous.inventory }));
      setEditing(false);
    }
  }

  const [handledInventoryState, setHandledInventoryState] = useState(inventoryState);
  if (inventoryState !== handledInventoryState) {
    setHandledInventoryState(inventoryState);
    if (inventoryState.status === "success") setInventory(inventoryState.data);
  }

  async function handleArchiveToggle() {
    setArchivePending(true);
    setArchiveError(null);
    const result = variant.archived_at
      ? await restoreVariantAction(variant.id, variant.updated_at, productId)
      : await archiveVariantAction(variant.id, variant.updated_at, productId);
    if (result.status === "success") {
      setVariant((previous) => ({ ...result.data, inventory: previous.inventory }));
    }
    else if (result.status === "error") setArchiveError(result.message);
    setArchivePending(false);
  }

  const variantErrors = variantState.status === "field_errors" ? variantState.errors : {};
  const inventoryErrors = inventoryState.status === "field_errors" ? inventoryState.errors : {};
  const rowDisabled = disabled || Boolean(variant.archived_at);
  const errorIdPrefix = `variant-${variant.id}`;

  if (!editing) {
    return (
      <tr>
        <td data-label="Nombre">{variant.label}</td>
        <td data-label="Tipo">{variant.variant_kind === "bottle" ? "Frasco" : "Decant"}</td>
        <td data-label="Tamaño (ml)">{variant.size_ml ?? "—"}</td>
        <td data-label="Precio">{variant.currency} {variant.price_amount.toFixed(2)}</td>
        <td data-label="Inventario">
          {inventory
            ? `${inventory.inventory_mode === "tracked_quantity" ? `${inventory.quantity_on_hand ?? 0} u.` : "Solo estado"} · ${inventory.availability_status === "available" ? "Disponible" : "Agotado"}`
            : "—"}
        </td>
        <td data-label="Publicación">{variant.publication_status}</td>
        <td data-label="Acciones">
          {!rowDisabled ? (
            <button type="button" className={styles.secondaryButton} onClick={() => setEditing(true)}>
              Editar
            </button>
          ) : null}
          {!disabled ? (
            <button
              type="button"
              className={`${styles.dangerButton} ${styles.actionSpacing}`}
              disabled={archivePending}
              onClick={handleArchiveToggle}
            >
              {variant.archived_at
                ? (archivePending ? "Restaurando…" : "Restaurar")
                : (archivePending ? "Archivando…" : "Archivar")}
            </button>
          ) : null}
          {archiveError ? <p className={formStyles.error} role="alert">{archiveError}</p> : null}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={7}>
        <form action={variantFormAction} className={styles.section} aria-busy={variantPending}>
          {variantState.status === "error" ? (
            <p className={formStyles.error} role="alert">{variantState.message}</p>
          ) : null}
          <div className={formStyles.grid}>
            <label className={formStyles.field}>
              <span>Nombre *</span>
              <input name="label" defaultValue={variant.label} required maxLength={60} aria-invalid={!!variantErrors.label} aria-describedby={variantErrors.label ? `${errorIdPrefix}-label-error` : undefined} />
              {variantErrors.label ? <p id={`${errorIdPrefix}-label-error`} className={formStyles.error} role="alert">{variantErrors.label}</p> : null}
            </label>
            <label className={formStyles.field}>
              <span>Tipo</span>
              <select name="variantKind" defaultValue={variant.variant_kind} aria-invalid={!!variantErrors.variantKind} aria-describedby={variantErrors.variantKind ? `${errorIdPrefix}-kind-error` : undefined}>
                <option value="decant">Decant</option>
                <option value="bottle">Frasco</option>
              </select>
              {variantErrors.variantKind ? <p id={`${errorIdPrefix}-kind-error`} className={formStyles.error} role="alert">{variantErrors.variantKind}</p> : null}
            </label>
            <label className={formStyles.field}>
              <span>Tamaño (ml)</span>
              <input name="sizeMl" type="number" step="0.01" min="0.01" defaultValue={variant.size_ml ?? ""} aria-invalid={!!variantErrors.sizeMl} aria-describedby={variantErrors.sizeMl ? `${errorIdPrefix}-size-error` : undefined} />
              {variantErrors.sizeMl ? <p id={`${errorIdPrefix}-size-error`} className={formStyles.error} role="alert">{variantErrors.sizeMl}</p> : null}
            </label>
            <label className={formStyles.field}>
              <span>Precio *</span>
              <input name="priceAmount" type="number" step="0.01" min="0" defaultValue={variant.price_amount} required aria-invalid={!!variantErrors.priceAmount} aria-describedby={variantErrors.priceAmount ? `${errorIdPrefix}-price-error` : undefined} />
              {variantErrors.priceAmount ? <p id={`${errorIdPrefix}-price-error`} className={formStyles.error} role="alert">{variantErrors.priceAmount}</p> : null}
            </label>
            <label className={formStyles.field}>
              <span>Moneda</span>
              <input name="currency" defaultValue={variant.currency} maxLength={3} aria-invalid={!!variantErrors.currency} aria-describedby={variantErrors.currency ? `${errorIdPrefix}-currency-error` : undefined} />
              {variantErrors.currency ? <p id={`${errorIdPrefix}-currency-error`} className={formStyles.error} role="alert">{variantErrors.currency}</p> : null}
            </label>
            <label className={formStyles.field}>
              <span>SKU</span>
              <input name="sku" defaultValue={variant.sku ?? ""} maxLength={60} aria-invalid={!!variantErrors.sku} aria-describedby={variantErrors.sku ? `${errorIdPrefix}-sku-error` : undefined} />
              {variantErrors.sku ? <p id={`${errorIdPrefix}-sku-error`} className={formStyles.error} role="alert">{variantErrors.sku}</p> : null}
            </label>
            <label className={formStyles.field}>
              <span>Publicación</span>
              <select name="publicationStatus" defaultValue={variant.publication_status} aria-invalid={!!variantErrors.publicationStatus} aria-describedby={variantErrors.publicationStatus ? `${errorIdPrefix}-publication-error` : undefined}>
                <option value="draft">Borrador</option>
                <option value="published">Publicado</option>
                <option value="archived">Archivado</option>
              </select>
              {variantErrors.publicationStatus ? <p id={`${errorIdPrefix}-publication-error`} className={formStyles.error} role="alert">{variantErrors.publicationStatus}</p> : null}
            </label>
            <label className={formStyles.field}>
              <span>Orden</span>
              <input name="sortOrder" type="number" step="1" defaultValue={variant.sort_order} aria-invalid={!!variantErrors.sortOrder} aria-describedby={variantErrors.sortOrder ? `${errorIdPrefix}-sort-error` : undefined} />
              {variantErrors.sortOrder ? <p id={`${errorIdPrefix}-sort-error`} className={formStyles.error} role="alert">{variantErrors.sortOrder}</p> : null}
            </label>
          </div>
          <div className={`${styles.formActions} ${styles.spacingTop}`}>
            <button type="submit" className={styles.primaryButton} disabled={variantPending}>
              {variantPending ? "Guardando…" : "Guardar variante"}
            </button>
            <button type="button" className={styles.secondaryButton} onClick={() => setEditing(false)}>
              Cerrar
            </button>
          </div>
        </form>

        {inventory && boundUpdateInventory ? (
          <form action={inventoryFormAction} className={`${styles.section} ${styles.spacingTop}`} aria-busy={inventoryPending}>
            {inventoryState.status === "error" ? (
              <p className={formStyles.error} role="alert">{inventoryState.message}</p>
            ) : null}
            <div className={formStyles.grid}>
              <label className={formStyles.field}>
                <span>Modo de inventario</span>
                <select name="inventoryMode" defaultValue={inventory.inventory_mode} aria-invalid={!!inventoryErrors.inventoryMode} aria-describedby={inventoryErrors.inventoryMode ? `${errorIdPrefix}-inventory-mode-error` : undefined}>
                  <option value="status_only">Solo estado</option>
                  <option value="tracked_quantity">Cantidad controlada</option>
                </select>
                {inventoryErrors.inventoryMode ? <p id={`${errorIdPrefix}-inventory-mode-error`} className={formStyles.error} role="alert">{inventoryErrors.inventoryMode}</p> : null}
              </label>
              <label className={formStyles.field}>
                <span>Disponibilidad</span>
                <select name="availabilityStatus" defaultValue={inventory.availability_status} aria-invalid={!!inventoryErrors.availabilityStatus} aria-describedby={inventoryErrors.availabilityStatus ? `${errorIdPrefix}-availability-error` : undefined}>
                  <option value="available">Disponible</option>
                  <option value="out_of_stock">Agotado</option>
                </select>
                {inventoryErrors.availabilityStatus ? <p id={`${errorIdPrefix}-availability-error`} className={formStyles.error} role="alert">{inventoryErrors.availabilityStatus}</p> : null}
              </label>
              <label className={formStyles.field}>
                <span>Cantidad en stock</span>
                <input
                  name="quantityOnHand"
                  type="number"
                  step="1"
                  min="0"
                  defaultValue={inventory.quantity_on_hand ?? ""}
                  aria-invalid={!!inventoryErrors.quantityOnHand}
                  aria-describedby={inventoryErrors.quantityOnHand ? `${errorIdPrefix}-quantity-error` : undefined}
                />
                {inventoryErrors.quantityOnHand ? (
                  <p id={`${errorIdPrefix}-quantity-error`} className={formStyles.error} role="alert">{inventoryErrors.quantityOnHand}</p>
                ) : null}
              </label>
            </div>
            <div className={`${styles.formActions} ${styles.spacingTop}`}>
              <button type="submit" className={styles.primaryButton} disabled={inventoryPending}>
                {inventoryPending ? "Guardando…" : "Guardar inventario"}
              </button>
            </div>
          </form>
        ) : null}
      </td>
    </tr>
  );
}
