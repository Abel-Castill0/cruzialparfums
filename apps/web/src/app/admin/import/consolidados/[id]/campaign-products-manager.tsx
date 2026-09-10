"use client";

import { useMemo, useState, useTransition } from "react";
import type {
  CampaignProductItem,
  EligibleImportProduct,
} from "@/domains/admin-import/campaign-products-repository";
import {
  AVAILABILITY_LABELS,
  isCampaignProductAvailability,
  type CampaignProductAvailability,
} from "@/domains/admin-import/campaign-products-schema";
import { setCampaignProductsAction } from "../actions";
import formStyles from "@/components/admin/product-form-fields.module.css";
import styles from "@/app/admin/parfums/productos/page.module.css";

type Row = {
  productId: string;
  productVariantId: string | null;
  priceAmount: number;
  availabilityStatus: CampaignProductAvailability;
  quantityLimit: number | null;
  productName: string;
  variantLabel: string | null;
  productArchived: boolean;
  variantArchived: boolean;
};

function toRow(item: CampaignProductItem): Row {
  return {
    productId: item.productId,
    productVariantId: item.productVariantId,
    priceAmount: item.priceAmount,
    availabilityStatus: isCampaignProductAvailability(item.availabilityStatus) ? item.availabilityStatus : "available",
    quantityLimit: item.quantityLimit,
    productName: item.productName,
    variantLabel: item.variantLabel,
    productArchived: item.productArchived,
    variantArchived: item.variantArchived,
  };
}

function rowKey(row: Row): string {
  return `${row.productId}::${row.productVariantId ?? ""}`;
}

function sameSet(a: Row[], b: Row[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, index) => {
    const other = b[index];
    return !!other
      && other.productId === row.productId
      && other.productVariantId === row.productVariantId
      && other.priceAmount === row.priceAmount
      && other.availabilityStatus === row.availabilityStatus
      && other.quantityLimit === row.quantityLimit;
  });
}

/**
 * Manages campaign_products only — never the base Import product/variant
 * catalog (that is 4J3). "Guardar productos" sends the whole current array
 * in one full-replace call (admin_set_campaign_products); add/remove/
 * reorder/price/availability edits are local state until then — same design
 * as CompositionManager for combo_items. Price/availability/quantity_limit
 * are entered fresh per line, never copied from a reference price: they
 * belong to the campaign, not the product (client-decisions.md, Import/
 * Consolidados).
 */
export function CampaignProductsManager({
  campaignId,
  campaignUpdatedAt,
  onUpdatedAtChange,
  onSavedCountChange,
  items,
  eligibleProducts,
  disabled,
}: {
  campaignId: string;
  campaignUpdatedAt: string;
  onUpdatedAtChange: (updatedAt: string) => void;
  /** Fired with the saved row count so a parent's own "0 products" warning
   * (e.g. before opening the campaign) stays accurate right after a save,
   * without a full page reload. */
  onSavedCountChange?: (count: number) => void;
  items: CampaignProductItem[];
  eligibleProducts: EligibleImportProduct[];
  disabled: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => items.map(toRow));
  const [baseline, setBaseline] = useState<Row[]>(() => items.map(toRow));
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newAvailability, setNewAvailability] = useState<CampaignProductAvailability>("available");
  const [newQuantityLimit, setNewQuantityLimit] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const selectedProduct = useMemo(
    () => eligibleProducts.find((product) => product.id === selectedProductId) ?? null,
    [eligibleProducts, selectedProductId],
  );

  const dirty = useMemo(() => !sameSet(rows, baseline), [rows, baseline]);

  function handleAdd() {
    setAddError(null);
    if (!selectedProductId) {
      setAddError("Selecciona un producto.");
      return;
    }
    const variantId = selectedVariantId || null;
    const dedupe = `${selectedProductId}::${variantId ?? ""}`;
    if (rows.some((row) => rowKey(row) === dedupe)) {
      setAddError("Este producto (con esa variante) ya está en la lista.");
      return;
    }
    const price = Number(newPrice);
    if (!Number.isFinite(price) || price < 0) {
      setAddError("Ingresa un precio válido (0 o más).");
      return;
    }
    let quantityLimit: number | null = null;
    if (newQuantityLimit.trim()) {
      const parsedLimit = Number(newQuantityLimit);
      if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
        setAddError("El límite de cantidad debe ser un entero mayor que 0, o dejarse vacío.");
        return;
      }
      quantityLimit = parsedLimit;
    }
    const product = eligibleProducts.find((candidate) => candidate.id === selectedProductId);
    if (!product) {
      setAddError("Ese producto ya no está disponible. Recarga la página.");
      return;
    }
    const variant = variantId ? product.variants.find((candidate) => candidate.id === variantId) : null;
    if (variantId && !variant) {
      setAddError("Esa variante ya no está disponible. Recarga la página.");
      return;
    }

    setRows((previous) => [
      ...previous,
      {
        productId: selectedProductId,
        productVariantId: variantId,
        priceAmount: Math.round(price * 100) / 100,
        availabilityStatus: newAvailability,
        quantityLimit,
        productName: product.name,
        variantLabel: variant?.label ?? null,
        productArchived: false,
        variantArchived: false,
      },
    ]);
    setSelectedVariantId("");
    setNewPrice("");
    setNewQuantityLimit("");
    setNewAvailability("available");
    setSaved(false);
  }

  function handleRemove(key: string) {
    setRows((previous) => previous.filter((row) => rowKey(row) !== key));
    setSaved(false);
  }

  function handlePriceChange(key: string, value: string) {
    const price = Number(value);
    setRows((previous) =>
      previous.map((row) => (rowKey(row) === key ? { ...row, priceAmount: price } : row)),
    );
    setSaved(false);
  }

  function handleAvailabilityChange(key: string, value: CampaignProductAvailability) {
    setRows((previous) =>
      previous.map((row) => (rowKey(row) === key ? { ...row, availabilityStatus: value } : row)),
    );
    setSaved(false);
  }

  function handleQuantityLimitChange(key: string, value: string) {
    const quantityLimit = value.trim() ? Number(value) : null;
    setRows((previous) =>
      previous.map((row) => (rowKey(row) === key ? { ...row, quantityLimit } : row)),
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
        productId: row.productId,
        productVariantId: row.productVariantId,
        priceAmount: row.priceAmount,
        availabilityStatus: row.availabilityStatus,
        quantityLimit: row.quantityLimit,
        sortOrder: index,
      }));
      const result = await setCampaignProductsAction(campaignId, campaignUpdatedAt, payload);
      if (result.status === "success") {
        onUpdatedAtChange(result.data.campaign.updated_at);
        onSavedCountChange?.(result.data.items.length);
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
    <section className={styles.section} aria-labelledby="campaign-products-title" aria-busy={isPending}>
      <div className={styles.sectionTitle}>
        <h2 id="campaign-products-title">Productos del consolidado ({rows.length})</h2>
      </div>
      <p className={styles.notice}>
        Precio, disponibilidad y límite de cantidad pertenecen a este consolidado — no al producto base. Un mismo
        producto puede tener precios distintos en otro consolidado.
      </p>

      {error ? <p className={formStyles.error} role="alert">{error}</p> : null}
      {Object.keys(fieldErrors).length > 0 ? (
        <p className={formStyles.error} role="alert">{Object.values(fieldErrors)[0]}</p>
      ) : null}
      {saved ? <p className={styles.savedNote} role="status">Productos guardados.</p> : null}

      {rows.length === 0 ? (
        <p className={styles.notice}>Este consolidado aún no tiene productos.</p>
      ) : (
        <table className={styles.variantTable}>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Precio (PEN)</th>
              <th>Disponibilidad</th>
              <th>Límite</th>
              <th>Orden</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const key = rowKey(row);
              const rowLabel = row.variantLabel ? `${row.productName} · ${row.variantLabel}` : row.productName;
              return (
                <tr key={key}>
                  <td data-label="Producto">
                    {row.productName}
                    {row.variantLabel ? ` · ${row.variantLabel}` : ""}
                    {row.productArchived ? <span className={styles.badgeArchived}> Producto archivado</span> : null}
                    {row.variantArchived ? <span className={styles.badgeArchived}> Variante archivada</span> : null}
                  </td>
                  <td data-label="Precio (PEN)">
                    <label className={formStyles.field}>
                      <span className={styles.srOnly}>Precio de {rowLabel}</span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={row.priceAmount}
                        disabled={disabled}
                        onChange={(event) => handlePriceChange(key, event.target.value)}
                      />
                    </label>
                  </td>
                  <td data-label="Disponibilidad">
                    <label className={formStyles.field}>
                      <span className={styles.srOnly}>Disponibilidad de {rowLabel}</span>
                      <select
                        value={row.availabilityStatus}
                        disabled={disabled}
                        onChange={(event) => handleAvailabilityChange(key, event.target.value as CampaignProductAvailability)}
                      >
                        <option value="available">{AVAILABILITY_LABELS.available}</option>
                        <option value="out_of_stock">{AVAILABILITY_LABELS.out_of_stock}</option>
                      </select>
                    </label>
                  </td>
                  <td data-label="Límite">
                    <label className={formStyles.field}>
                      <span className={styles.srOnly}>Límite de cantidad de {rowLabel}</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        placeholder="Sin límite"
                        value={row.quantityLimit ?? ""}
                        disabled={disabled}
                        onChange={(event) => handleQuantityLimitChange(key, event.target.value)}
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
                        onClick={() => handleRemove(key)}
                        aria-label={`Quitar ${rowLabel} del consolidado`}
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
                {eligibleProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.brand ? `${product.brand} — ` : ""}{product.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={formStyles.field}>
              <span>Variante (opcional)</span>
              <select
                value={selectedVariantId}
                onChange={(event) => setSelectedVariantId(event.target.value)}
                disabled={!selectedProductId || (selectedProduct?.variants.length ?? 0) === 0}
              >
                <option value="">Producto completo (sin variante)</option>
                {(selectedProduct?.variants ?? []).map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.label}{variant.sizeMl ? ` · ${variant.sizeMl} ml` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className={formStyles.field}>
              <span>Precio (PEN)</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={newPrice}
                onChange={(event) => setNewPrice(event.target.value)}
              />
            </label>
            <label className={formStyles.field}>
              <span>Disponibilidad</span>
              <select
                value={newAvailability}
                onChange={(event) => setNewAvailability(event.target.value as CampaignProductAvailability)}
              >
                <option value="available">{AVAILABILITY_LABELS.available}</option>
                <option value="out_of_stock">{AVAILABILITY_LABELS.out_of_stock}</option>
              </select>
            </label>
            <label className={formStyles.field}>
              <span>Límite de cantidad (opcional)</span>
              <input
                type="number"
                min={1}
                step={1}
                placeholder="Sin límite"
                value={newQuantityLimit}
                onChange={(event) => setNewQuantityLimit(event.target.value)}
              />
            </label>
          </div>
          {addError ? <p className={formStyles.error} role="alert">{addError}</p> : null}
          {eligibleProducts.length === 0 ? (
            <p className={styles.notice}>
              No hay productos base de Cruzial Import disponibles todavía (Fase 4J3 — extracción del catálogo —
              aún no se ha ejecutado).
            </p>
          ) : (
            <div className={`${styles.formActions} ${styles.spacingTop}`}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleAdd}
                disabled={!selectedProductId}
              >
                + Agregar producto
              </button>
            </div>
          )}
        </div>
      ) : null}

      {!disabled ? (
        <div className={`${styles.formActions} ${styles.spacingTop}`}>
          <button type="button" className={styles.primaryButton} onClick={handleSave} disabled={isPending || !dirty}>
            {isPending ? "Guardando…" : "Guardar productos"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
