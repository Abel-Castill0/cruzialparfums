"use client";

import { useMemo, useState, useTransition } from "react";
import type { ComboCompositionItem, EligibleVariant } from "@/domains/admin-parfums/combos-repository";
import { setComboCompositionAction } from "../actions";
import formStyles from "@/components/admin/product-form-fields.module.css";
import styles from "../../productos/page.module.css";

type Row = {
  productVariantId: string;
  quantity: number;
  productName: string;
  productBrand: string | null;
  variantLabel: string;
  variantSizeMl: number | null;
  priceAmount: number;
  currency: string;
  variantArchived: boolean;
  productArchived: boolean;
};

function toRow(item: ComboCompositionItem): Row {
  return {
    productVariantId: item.productVariantId,
    quantity: item.quantity,
    productName: item.productName,
    productBrand: item.productBrand,
    variantLabel: item.variantLabel,
    variantSizeMl: item.variantSizeMl,
    priceAmount: item.priceAmount,
    currency: item.currency,
    variantArchived: item.variantArchived,
    productArchived: item.productArchived,
  };
}

function sameComposition(a: Row[], b: Row[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, index) => {
    const other = b[index];
    return !!other && other.productVariantId === row.productVariantId && other.quantity === row.quantity;
  });
}

/**
 * Manages combo_items only — never product/variant core data. "Guardar
 * composición" sends the whole current array in one full-replace call
 * (admin_set_combo_composition); add/remove/reorder/quantity are local state
 * until then. Reordering is up/down buttons, not drag-and-drop — a native,
 * keyboard-operable control is simpler and just as effective for the small
 * lists a combo composition realistically has (docs: Phase 4c, section 9).
 */
export function CompositionManager({
  comboId,
  comboUpdatedAt,
  onUpdatedAtChange,
  items,
  eligibleVariants,
  disabled,
}: {
  comboId: string;
  /** The combo's current `updated_at` — owned by the parent (ComboWorkspace),
   * not local state here, because ComboEditor mutates the same row/column
   * (composition_verification_status, archived_at) and both must always see
   * the same concurrency token. */
  comboUpdatedAt: string;
  onUpdatedAtChange: (updatedAt: string) => void;
  items: ComboCompositionItem[];
  eligibleVariants: EligibleVariant[];
  disabled: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => items.map(toRow));
  const [baseline, setBaseline] = useState<Row[]>(() => items.map(toRow));
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [newQuantity, setNewQuantity] = useState("1");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const productOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; brand: string | null }>();
    for (const variant of eligibleVariants) {
      if (!map.has(variant.productId)) {
        map.set(variant.productId, { id: variant.productId, name: variant.productName, brand: variant.productBrand });
      }
    }
    return [...map.values()];
  }, [eligibleVariants]);

  const variantOptions = useMemo(
    () => eligibleVariants.filter((variant) => variant.productId === selectedProductId),
    [eligibleVariants, selectedProductId],
  );

  const dirty = useMemo(() => !sameComposition(rows, baseline), [rows, baseline]);

  function handleAdd() {
    setAddError(null);
    if (!selectedVariantId) {
      setAddError("Selecciona un producto y una variante.");
      return;
    }
    if (rows.some((row) => row.productVariantId === selectedVariantId)) {
      setAddError("Esta variante ya está en la composición.");
      return;
    }
    const quantity = Number(newQuantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setAddError("La cantidad debe ser un entero mayor que 0.");
      return;
    }
    const variant = eligibleVariants.find((candidate) => candidate.id === selectedVariantId);
    if (!variant) {
      setAddError("Esa variante ya no está disponible. Recarga la página.");
      return;
    }
    setRows((previous) => [
      ...previous,
      {
        productVariantId: variant.id,
        quantity,
        productName: variant.productName,
        productBrand: variant.productBrand,
        variantLabel: variant.label,
        variantSizeMl: variant.sizeMl,
        priceAmount: variant.priceAmount,
        currency: variant.currency,
        variantArchived: false,
        productArchived: false,
      },
    ]);
    setSelectedVariantId("");
    setNewQuantity("1");
    setSaved(false);
  }

  function handleRemove(productVariantId: string) {
    setRows((previous) => previous.filter((row) => row.productVariantId !== productVariantId));
    setSaved(false);
  }

  function handleQuantityChange(productVariantId: string, value: string) {
    const quantity = Number(value);
    setRows((previous) =>
      previous.map((row) => (row.productVariantId === productVariantId ? { ...row, quantity } : row)),
    );
    setSaved(false);
  }

  function move(index: number, direction: -1 | 1) {
    setRows((previous) => {
      const next = [...previous];
      const target = index + direction;
      if (target < 0 || target >= next.length) return previous;
      const [moved] = next.splice(index, 1);
      if (!moved) return previous;
      next.splice(target, 0, moved);
      return next;
    });
    setSaved(false);
  }

  function handleSave() {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const payload = rows.map((row, index) => ({
        productVariantId: row.productVariantId,
        quantity: row.quantity,
        sortOrder: index,
      }));
      const result = await setComboCompositionAction(comboId, comboUpdatedAt, payload);
      if (result.status === "success") {
        onUpdatedAtChange(result.data.combo.updated_at);
        setBaseline(rows);
        setSaved(true);
      } else if (result.status === "field_errors") {
        setFieldErrors(result.errors);
      } else if (result.status === "error") {
        setError(result.message);
      }
    });
  }

  return (
    <section className={styles.section} aria-labelledby="composition-title" aria-busy={isPending}>
      <div className={styles.sectionTitle}>
        <h2 id="composition-title">Composición ({rows.length})</h2>
      </div>

      {error ? <p className={formStyles.error} role="alert">{error}</p> : null}
      {Object.keys(fieldErrors).length > 0 ? (
        <p className={formStyles.error} role="alert">{Object.values(fieldErrors)[0]}</p>
      ) : null}
      {saved ? <p className={styles.savedNote} role="status">Composición guardada.</p> : null}

      {rows.length === 0 ? (
        <p className={styles.notice}>Este combo aún no tiene productos.</p>
      ) : (
        <table className={styles.variantTable}>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Variante</th>
              <th>Precio ref.</th>
              <th>Cantidad</th>
              <th>Orden</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const rowLabel = `${row.productName} · ${row.variantLabel}`;
              return (
                <tr key={row.productVariantId}>
                  <td data-label="Producto">
                    {row.productName}
                    {row.productBrand ? ` (${row.productBrand})` : ""}
                    {row.productArchived ? (
                      <span className={styles.badgeArchived}> Producto archivado</span>
                    ) : null}
                  </td>
                  <td data-label="Variante">
                    {row.variantLabel}
                    {row.variantSizeMl ? ` · ${row.variantSizeMl} ml` : ""}
                    {row.variantArchived ? <span className={styles.badgeArchived}> Archivada</span> : null}
                  </td>
                  <td data-label="Precio ref.">{row.currency} {row.priceAmount.toFixed(2)}</td>
                  <td data-label="Cantidad">
                    <label className={formStyles.field}>
                      <span className={styles.srOnly}>Cantidad de {rowLabel}</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={row.quantity}
                        disabled={disabled}
                        onChange={(event) => handleQuantityChange(row.productVariantId, event.target.value)}
                      />
                    </label>
                  </td>
                  <td data-label="Orden">
                    {!disabled ? (
                      <>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => move(index, -1)}
                          disabled={index === 0}
                          aria-label={`Subir ${rowLabel}`}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className={`${styles.secondaryButton} ${styles.actionSpacing}`}
                          onClick={() => move(index, 1)}
                          disabled={index === rows.length - 1}
                          aria-label={`Bajar ${rowLabel}`}
                        >
                          ↓
                        </button>
                      </>
                    ) : null}
                  </td>
                  <td data-label="Acciones">
                    {!disabled ? (
                      <button
                        type="button"
                        className={styles.dangerButton}
                        onClick={() => handleRemove(row.productVariantId)}
                        aria-label={`Quitar ${rowLabel} de la composición`}
                      >
                        Quitar
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {!disabled ? (
        <div className={`${styles.section} ${styles.spacingTop}`}>
          <div className={formStyles.grid}>
            <label className={formStyles.field}>
              <span>Producto</span>
              <select
                value={selectedProductId}
                onChange={(event) => {
                  setSelectedProductId(event.target.value);
                  setSelectedVariantId("");
                }}
              >
                <option value="">Selecciona un producto…</option>
                {productOptions.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.brand ? `${product.brand} — ` : ""}{product.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={formStyles.field}>
              <span>Variante</span>
              <select
                value={selectedVariantId}
                onChange={(event) => setSelectedVariantId(event.target.value)}
                disabled={!selectedProductId}
              >
                <option value="">Selecciona una variante…</option>
                {variantOptions.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.label}
                    {variant.sizeMl ? ` · ${variant.sizeMl} ml` : ""} · {variant.currency} {variant.priceAmount.toFixed(2)}
                  </option>
                ))}
              </select>
            </label>
            <label className={formStyles.field}>
              <span>Cantidad</span>
              <input
                type="number"
                min={1}
                step={1}
                value={newQuantity}
                onChange={(event) => setNewQuantity(event.target.value)}
              />
            </label>
          </div>
          {addError ? <p className={formStyles.error} role="alert">{addError}</p> : null}
          {productOptions.length === 0 ? (
            <p className={styles.notice}>No hay otros productos Parfums elegibles para agregar todavía.</p>
          ) : (
            <div className={`${styles.formActions} ${styles.spacingTop}`}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleAdd}
                disabled={!selectedVariantId}
              >
                + Agregar a la composición
              </button>
            </div>
          )}
        </div>
      ) : null}

      {!disabled ? (
        <div className={`${styles.formActions} ${styles.spacingTop}`}>
          <button type="button" className={styles.primaryButton} onClick={handleSave} disabled={isPending || !dirty}>
            {isPending ? "Guardando…" : "Guardar composición"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
