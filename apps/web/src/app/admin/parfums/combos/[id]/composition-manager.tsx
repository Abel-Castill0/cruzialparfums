"use client";

import { useMemo, useState, useTransition } from "react";
import type { ComboCompositionItem, ComboProductVariant, ComboRow, EligibleVariant } from "@/domains/admin-parfums/combos-repository";
import { setComboCompositionAction } from "../actions";
import formStyles from "@/components/admin/product-form-fields.module.css";
import styles from "../../productos/page.module.css";

type Row = {
  comboProductVariantId: string;
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

export function comboItemKey(item: Pick<Row, "comboProductVariantId" | "productVariantId">): string {
  return `${item.comboProductVariantId}:${item.productVariantId}`;
}

function toRow(item: ComboCompositionItem): Row {
  return {
    comboProductVariantId: item.comboProductVariantId,
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

export function sameComposition(a: Row[], b: Row[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, index) => {
    const other = b[index];
    return !!other && comboItemKey(other) === comboItemKey(row) && other.quantity === row.quantity;
  });
}

export function CompositionManager({
  comboId, comboUpdatedAt, onComboChange, comboProductVariants, items, eligibleVariants, disabled,
}: {
  comboId: string;
  comboUpdatedAt: string;
  onComboChange: (combo: ComboRow) => void;
  comboProductVariants: ComboProductVariant[];
  items: ComboCompositionItem[];
  eligibleVariants: EligibleVariant[];
  disabled: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => items.map(toRow));
  const [baseline, setBaseline] = useState<Row[]>(() => items.map(toRow));
  const [selectedProduct, setSelectedProduct] = useState<Record<string, string>>({});
  const [selectedVariant, setSelectedVariant] = useState<Record<string, string>>({});
  const [newQuantity, setNewQuantity] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [addError, setAddError] = useState<Record<string, string>>({});

  const productOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; brand: string | null }>();
    for (const variant of eligibleVariants) {
      if (!map.has(variant.productId)) map.set(variant.productId, { id: variant.productId, name: variant.productName, brand: variant.productBrand });
    }
    return [...map.values()];
  }, [eligibleVariants]);

  const dirty = useMemo(() => !sameComposition(rows, baseline), [rows, baseline]);

  function handleAdd(comboProductVariantId: string) {
    setAddError((previous) => ({ ...previous, [comboProductVariantId]: "" }));
    const selectedVariantId = selectedVariant[comboProductVariantId] ?? "";
    if (!selectedVariantId) {
      setAddError((previous) => ({ ...previous, [comboProductVariantId]: "Selecciona un producto y una variante." }));
      return;
    }
    if (rows.some((row) => comboItemKey(row) === `${comboProductVariantId}:${selectedVariantId}`)) {
      setAddError((previous) => ({ ...previous, [comboProductVariantId]: "Esta variante ya está en esta presentación." }));
      return;
    }
    const quantity = Number(newQuantity[comboProductVariantId] ?? "1");
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setAddError((previous) => ({ ...previous, [comboProductVariantId]: "La cantidad debe ser un entero mayor que 0." }));
      return;
    }
    const variant = eligibleVariants.find((candidate) => candidate.id === selectedVariantId);
    if (!variant) {
      setAddError((previous) => ({ ...previous, [comboProductVariantId]: "Esa variante ya no está disponible. Recarga la página." }));
      return;
    }
    setRows((previous) => [...previous, {
      comboProductVariantId,
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
    }]);
    setSelectedVariant((previous) => ({ ...previous, [comboProductVariantId]: "" }));
    setNewQuantity((previous) => ({ ...previous, [comboProductVariantId]: "1" }));
    setSaved(false);
  }

  function handleRemove(identity: string) {
    setRows((previous) => previous.filter((row) => comboItemKey(row) !== identity));
    setSaved(false);
  }

  function handleQuantityChange(identity: string, value: string) {
    const quantity = Number(value);
    setRows((previous) => previous.map((row) => comboItemKey(row) === identity ? { ...row, quantity } : row));
    setSaved(false);
  }

  function move(comboProductVariantId: string, productVariantId: string, direction: -1 | 1) {
    setRows((previous) => {
      const group = previous.filter((row) => row.comboProductVariantId === comboProductVariantId);
      const index = group.findIndex((row) => row.productVariantId === productVariantId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= group.length) return previous;
      [group[index], group[target]] = [group[target]!, group[index]!];
      let cursor = 0;
      return previous.map((row) => row.comboProductVariantId === comboProductVariantId ? group[cursor++]! : row);
    });
    setSaved(false);
  }

  function handleSave() {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const payload = comboProductVariants.flatMap((presentation) => rows
        .filter((row) => row.comboProductVariantId === presentation.id)
        .map((row, index) => ({
          comboProductVariantId: row.comboProductVariantId,
          productVariantId: row.productVariantId,
          quantity: row.quantity,
          sortOrder: index,
        })));
      const result = await setComboCompositionAction(comboId, comboUpdatedAt, payload);
      if (result.status === "success") {
        onComboChange(result.data.combo);
        setBaseline(rows);
        setSaved(true);
      } else if (result.status === "field_errors") setFieldErrors(result.errors);
      else if (result.status === "error") setError(result.message);
    });
  }

  return (
    <section className={styles.section} aria-labelledby="composition-title" aria-busy={isPending}>
      <div className={styles.sectionTitle}><h2 id="composition-title">Composición ({rows.length})</h2></div>
      {error ? <p className={formStyles.error} role="alert">{error}</p> : null}
      {Object.keys(fieldErrors).length > 0 ? <p className={formStyles.error} role="alert">{Object.values(fieldErrors)[0]}</p> : null}
      {saved ? <p className={styles.savedNote} role="status">Composición guardada.</p> : null}
      {comboProductVariants.length === 0 ? <p className={styles.notice}>Este combo aún no tiene presentaciones.</p> : null}

      {comboProductVariants.map((presentation) => {
        const groupRows = rows.filter((row) => row.comboProductVariantId === presentation.id);
        const productId = selectedProduct[presentation.id] ?? "";
        const variantOptions = eligibleVariants.filter((variant) => variant.productId === productId);
        const presentationLabel = presentation.sizeMl ? `${presentation.label} · ${presentation.sizeMl} ml` : presentation.label;
        const presentationDisabled = disabled || presentation.archived;
        return (
          <section key={presentation.id} className={`${styles.section} ${styles.spacingTop}`} aria-labelledby={`presentation-${presentation.id}`}>
            <div className={styles.sectionTitle}>
              <h3 id={`presentation-${presentation.id}`}>Presentación: {presentationLabel}</h3>
              {presentation.archived ? <span className={styles.badgeArchived}>Archivada · composición histórica</span> : null}
            </div>
            {groupRows.length === 0 ? <p className={styles.notice}>Sin ingredientes en esta presentación.</p> : (
              <table className={styles.variantTable}>
                <thead><tr><th>Producto</th><th>Variante</th><th>Precio ref.</th><th>Cantidad</th><th>Orden</th><th>Acciones</th></tr></thead>
                <tbody>{groupRows.map((row, index) => {
                  const identity = comboItemKey(row);
                  const rowLabel = `${row.productName} · ${row.variantLabel}`;
                  return (
                    <tr key={identity}>
                      <td data-label="Producto">{row.productName}{row.productBrand ? ` (${row.productBrand})` : ""}{row.productArchived ? <span className={styles.badgeArchived}> Producto archivado</span> : null}</td>
                      <td data-label="Variante">{row.variantLabel}{row.variantSizeMl ? ` · ${row.variantSizeMl} ml` : ""}{row.variantArchived ? <span className={styles.badgeArchived}> Archivada</span> : null}</td>
                      <td data-label="Precio ref.">{row.currency} {row.priceAmount.toFixed(2)}</td>
                      <td data-label="Cantidad"><label className={formStyles.field}><span className={styles.srOnly}>Cantidad de {rowLabel}</span><input type="number" min={1} step={1} value={row.quantity} disabled={presentationDisabled} onChange={(event) => handleQuantityChange(identity, event.target.value)} /></label></td>
                      <td data-label="Orden">{!disabled ? <><button type="button" className={styles.secondaryButton} onClick={() => move(presentation.id, row.productVariantId, -1)} disabled={index === 0 || isPending} aria-label={`Subir ${rowLabel}`}>↑</button><button type="button" className={`${styles.secondaryButton} ${styles.actionSpacing}`} onClick={() => move(presentation.id, row.productVariantId, 1)} disabled={index === groupRows.length - 1 || isPending} aria-label={`Bajar ${rowLabel}`}>↓</button></> : null}</td>
                      <td data-label="Acciones">{!presentationDisabled ? <button type="button" className={styles.dangerButton} onClick={() => handleRemove(identity)} aria-label={`Quitar ${rowLabel} de ${presentationLabel}`}>Quitar</button> : null}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            )}
            {!presentationDisabled ? (
              <div className={`${formStyles.grid} ${styles.spacingTop}`}>
                <label className={formStyles.field}><span>Producto para {presentationLabel}</span><select value={productId} onChange={(event) => { setSelectedProduct((previous) => ({ ...previous, [presentation.id]: event.target.value })); setSelectedVariant((previous) => ({ ...previous, [presentation.id]: "" })); }}><option value="">Selecciona un producto…</option>{productOptions.map((product) => <option key={product.id} value={product.id}>{product.brand ? `${product.brand} — ` : ""}{product.name}</option>)}</select></label>
                <label className={formStyles.field}><span>Variante ingrediente</span><select value={selectedVariant[presentation.id] ?? ""} onChange={(event) => setSelectedVariant((previous) => ({ ...previous, [presentation.id]: event.target.value }))} disabled={!productId}><option value="">Selecciona una variante…</option>{variantOptions.map((variant) => <option key={variant.id} value={variant.id}>{variant.label}{variant.sizeMl ? ` · ${variant.sizeMl} ml` : ""} · {variant.currency} {variant.priceAmount.toFixed(2)}</option>)}</select></label>
                <label className={formStyles.field}><span>Cantidad</span><input type="number" min={1} step={1} value={newQuantity[presentation.id] ?? "1"} onChange={(event) => setNewQuantity((previous) => ({ ...previous, [presentation.id]: event.target.value }))} /></label>
                <div className={formStyles.field}><span className={styles.srOnly}>Agregar ingrediente</span><button type="button" className={styles.secondaryButton} onClick={() => handleAdd(presentation.id)} disabled={!selectedVariant[presentation.id]}>+ Agregar a {presentation.label}</button></div>
                {addError[presentation.id] ? <p className={formStyles.error} role="alert">{addError[presentation.id]}</p> : null}
              </div>
            ) : null}
          </section>
        );
      })}

      {!disabled ? <div className={`${styles.formActions} ${styles.spacingTop}`}><button type="button" className={styles.primaryButton} onClick={handleSave} disabled={isPending || !dirty}>{isPending ? "Guardando…" : "Guardar composición"}</button></div> : null}
    </section>
  );
}
