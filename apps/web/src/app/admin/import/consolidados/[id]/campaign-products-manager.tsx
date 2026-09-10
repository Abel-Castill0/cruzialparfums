"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type {
  CampaignProductItem,
  EligibleImportProduct,
} from "@/domains/admin-import/campaign-products-repository";
import {
  AVAILABILITY_LABELS,
  isValidMoneyText,
  normalizeMoneyText,
  type CampaignProductAvailability,
} from "@/domains/admin-import/campaign-products-schema";
import {
  AVAILABILITY_STATUS_LABELS,
  VISIBILITY_REASON_LABELS,
  classifyOfferReadiness,
  type ProductPublicationStatus,
  type VariantPublicationStatus,
} from "@/domains/admin-import/campaign-readiness";
import { searchEligibleImportProductsAction, setCampaignProductsAction } from "../actions";
import formStyles from "@/components/admin/product-form-fields.module.css";
import styles from "@/app/admin/parfums/productos/page.module.css";

const PICKER_PRODUCT_PUBLICATION_LABELS: Record<Exclude<ProductPublicationStatus, "archived">, string> = {
  published: "Publicado",
  draft: "Borrador",
  hidden: "Oculto",
};

const PICKER_PRODUCT_PUBLICATION_CLASS: Record<Exclude<ProductPublicationStatus, "archived">, string> = {
  published: styles["status-published"] ?? "",
  draft: styles["status-draft"] ?? "",
  hidden: styles["status-archived"] ?? "",
};

const PICKER_VARIANT_PUBLICATION_LABELS: Record<Exclude<VariantPublicationStatus, "archived">, string> = {
  published: "Publicado",
  draft: "Borrador — no listo públicamente",
};

type Row = {
  productId: string;
  productVariantId: string | null;
  /** Canonical decimal text (e.g. "16.00") — never a JS number. The input
   * itself may transiently hold something not yet valid while the admin is
   * typing; validity is only enforced on save (see handleSave/dirty). */
  priceAmount: string;
  availabilityStatus: CampaignProductAvailability;
  productName: string;
  variantLabel: string | null;
  productArchived: boolean;
  variantArchived: boolean;
  // The following four exist only to feed classifyOfferReadiness — a pure
  // mirror of the same fields RLS itself gates on, never rendered as raw
  // catalog data beyond the readiness badges below.
  productArchivedAt: string | null;
  productPublicationStatus: ProductPublicationStatus | null;
  variantArchivedAt: string | null;
  variantPublicationStatus: VariantPublicationStatus | null;
};

function toRow(item: CampaignProductItem): Row {
  return {
    productId: item.productId,
    productVariantId: item.productVariantId,
    priceAmount: item.priceAmount,
    availabilityStatus: item.availabilityStatus,
    productName: item.productName,
    variantLabel: item.variantLabel,
    productArchived: item.productArchived,
    variantArchived: item.variantArchived,
    productArchivedAt: item.productArchivedAt,
    productPublicationStatus: item.productPublicationStatus,
    variantArchivedAt: item.variantArchivedAt,
    variantPublicationStatus: item.variantPublicationStatus,
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
      && other.availabilityStatus === row.availabilityStatus;
    // quantityLimit deliberately excluded: it is never client-editable, so
    // it can never make the local set "dirty" relative to the baseline —
    // and it is not even part of this component's data any more (4J2
    // correction: kept server-internal, never sent to the browser).
  });
}

/**
 * Manages campaign_products only — never the base Import product/variant
 * catalog (that is 4J3). "Guardar productos" sends the whole current array
 * in one full-replace call (admin_set_campaign_products); add/remove/
 * reorder/price/availability edits are local state until then — same design
 * as CompositionManager for combo_items. Price/availability are entered
 * fresh per line, never copied from a reference price: they belong to the
 * campaign, not the product (client-decisions.md, Import/Consolidados).
 * quantity_limit has no confirmed rule (client-decisions.md: UNKNOWN) and is
 * not exposed here at all — admin_set_campaign_products preserves any
 * existing value server-side; the browser can neither see nor set it.
 *
 * Each configured offer also shows its public-readiness (mirrors real RLS —
 * campaign-readiness.ts) and availability side by side, since they are
 * independent: an out_of_stock offer can still be publicly visible.
 */
export function CampaignProductsManager({
  campaignId,
  campaignUpdatedAt,
  campaignStatus,
  campaignArchivedAt,
  onUpdatedAtChange,
  onSavedCountChange,
  items,
  eligibleProducts,
  disabled,
}: {
  campaignId: string;
  campaignUpdatedAt: string;
  campaignStatus: string;
  campaignArchivedAt: string | null;
  onUpdatedAtChange: (updatedAt: string) => void;
  /** Fired with the saved row count so a parent's own "0 products" warning
   * (e.g. before opening the campaign) stays accurate right after a save,
   * without a full page reload. */
  onSavedCountChange?: (count: number) => void;
  items: CampaignProductItem[];
  /** Bounded first page (SSR) — the picker below refines it via
   * searchEligibleImportProductsAction, never the whole catalog. */
  eligibleProducts: EligibleImportProduct[];
  disabled: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => items.map(toRow));
  const [baseline, setBaseline] = useState<Row[]>(() => items.map(toRow));
  const [pickerResults, setPickerResults] = useState<EligibleImportProduct[]>(eligibleProducts);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerLoading, setPickerLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<EligibleImportProduct | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newAvailability, setNewAvailability] = useState<CampaignProductAvailability>("available");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dirty = useMemo(() => !sameSet(rows, baseline), [rows, baseline]);

  const readiness = useMemo(
    () =>
      rows.map((row) =>
        classifyOfferReadiness({
          campaignStatus,
          campaignArchivedAt,
          productPublicationStatus: row.productPublicationStatus,
          productArchivedAt: row.productArchivedAt,
          productVariantId: row.productVariantId,
          variantPublicationStatus: row.variantPublicationStatus,
          variantArchivedAt: row.variantArchivedAt,
          availabilityStatus: row.availabilityStatus,
        }),
      ),
    [rows, campaignStatus, campaignArchivedAt],
  );

  const summary = useMemo(() => {
    const visible = readiness.filter((r) => r.isPubliclyVisible).length;
    const outOfStock = readiness.filter((r) => r.availability === "out_of_stock").length;
    return {
      configured: rows.length,
      visible,
      blocked: rows.length - visible,
      outOfStock,
    };
  }, [readiness, rows.length]);

  // Debounced bounded search — never the whole catalog. Disabled entirely
  // when the manager itself is read-only (viewer) since the picker is not
  // rendered in that case anyway.
  useEffect(() => {
    if (disabled) return;
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    let cancelled = false;
    searchDebounce.current = setTimeout(() => {
      setPickerLoading(true);
      searchEligibleImportProductsAction(pickerQuery).then((result) => {
        if (cancelled) return;
        setPickerLoading(false);
        if (result.ok) setPickerResults(result.data);
      });
    }, 300);
    return () => {
      cancelled = true;
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [pickerQuery, disabled]);

  function handleAdd() {
    setAddError(null);
    if (!selectedProduct) {
      setAddError("Selecciona un producto.");
      return;
    }
    const variantId = selectedVariantId || null;
    const dedupe = `${selectedProduct.id}::${variantId ?? ""}`;
    if (rows.some((row) => rowKey(row) === dedupe)) {
      setAddError("Este producto (con esa variante) ya está en la lista.");
      return;
    }
    if (!isValidMoneyText(newPrice)) {
      setAddError("Ingresa un precio válido: solo dígitos y hasta 2 decimales, sin signo (ej. 16.50).");
      return;
    }
    const price = normalizeMoneyText(newPrice);
    const variant = variantId ? selectedProduct.variants.find((candidate) => candidate.id === variantId) : null;
    if (variantId && !variant) {
      setAddError("Esa variante ya no está disponible. Vuelve a buscar.");
      return;
    }

    setRows((previous) => [
      ...previous,
      {
        productId: selectedProduct.id,
        productVariantId: variantId,
        priceAmount: price,
        availabilityStatus: newAvailability,
        productName: selectedProduct.name,
        variantLabel: variant?.label ?? null,
        productArchived: false,
        variantArchived: false,
        productArchivedAt: null,
        productPublicationStatus: selectedProduct.publicationStatus,
        variantArchivedAt: null,
        variantPublicationStatus: variant?.publicationStatus ?? null,
      },
    ]);
    setSelectedVariantId("");
    setNewPrice("");
    setNewAvailability("available");
    setSaved(false);
  }

  function handleRemove(key: string) {
    setRows((previous) => previous.filter((row) => rowKey(row) !== key));
    setSaved(false);
  }

  function handlePriceChange(key: string, value: string) {
    // Kept as raw text while typing (never Number()) — validity is checked
    // at save time by validateCampaignProductItems, same contract as the
    // server. sameSet/dirty compares the raw text directly.
    setRows((previous) =>
      previous.map((row) => (rowKey(row) === key ? { ...row, priceAmount: value } : row)),
    );
    setSaved(false);
  }

  function handleAvailabilityChange(key: string, value: CampaignProductAvailability) {
    setRows((previous) =>
      previous.map((row) => (rowKey(row) === key ? { ...row, availabilityStatus: value } : row)),
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
      // quantity_limit is never sent — it is not browser-authoritative
      // (4J2 correction). The RPC preserves each existing association's
      // value by itself.
      const payload = rows.map((row, index) => ({
        productId: row.productId,
        productVariantId: row.productVariantId,
        priceAmount: row.priceAmount,
        availabilityStatus: row.availabilityStatus,
        sortOrder: index,
      }));
      const result = await setCampaignProductsAction(campaignId, campaignUpdatedAt, payload);
      if (result.status === "success") {
        onUpdatedAtChange(result.data.campaign.updated_at);
        onSavedCountChange?.(result.data.itemCount);
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
        Precio y disponibilidad pertenecen a este consolidado — no al producto base. Un mismo producto puede tener
        precios distintos en otro consolidado.
      </p>

      {/* --------------------------------------------------------------- */}
      {/* Open-campaign summary — read-only counts, never an action that   */}
      {/* publishes, opens, or changes availability by itself.             */}
      {/* --------------------------------------------------------------- */}
      <dl className={styles.rowStats} aria-label="Resumen de publicación">
        <div><dt>Productos configurados</dt><dd>{summary.configured}</dd></div>
        <div><dt>Visibles públicamente</dt><dd>{summary.visible}</dd></div>
        <div><dt>Bloqueados por publicación</dt><dd>{summary.blocked}</dd></div>
        <div><dt>Agotados</dt><dd>{summary.outOfStock}</dd></div>
      </dl>
      {campaignStatus !== "open" || campaignArchivedAt !== null ? (
        <p className={styles.notice}>
          Visibles públicamente = 0 posible aunque los productos estén publicados: el consolidado no está{" "}
          <strong>Abierto</strong> ahora mismo.
        </p>
      ) : null}

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
              <th>Publicación</th>
              <th>Orden</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const key = rowKey(row);
              const rowLabel = row.variantLabel ? `${row.productName} · ${row.variantLabel}` : row.productName;
              const rowReadiness = readiness[index];
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
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
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
                  <td data-label="Publicación">
                    {rowReadiness ? (
                      <div className={styles.rowBadges}>
                        <span className={`${styles.badge} ${rowReadiness.isPubliclyVisible ? styles["status-published"] : styles.badgeArchived}`}>
                          {VISIBILITY_REASON_LABELS[rowReadiness.visibilityReason]}
                        </span>
                        <span className={`${styles.badge} ${rowReadiness.availability === "available" ? styles["status-published"] : styles["status-draft"]}`}>
                          {AVAILABILITY_STATUS_LABELS[rowReadiness.availability]}
                        </span>
                      </div>
                    ) : null}
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
          <label className={formStyles.field}>
            <span>Buscar producto de Cruzial Import (nombre o marca)</span>
            <input
              type="text"
              value={pickerQuery}
              onChange={(event) => {
                setPickerQuery(event.target.value);
                setSelectedProduct(null);
                setSelectedVariantId("");
              }}
              placeholder="Ej. Armaf, Club de Nuit…"
            />
          </label>

          {pickerLoading ? <p className={styles.notice}>Buscando…</p> : null}

          {pickerResults.length === 0 && !pickerLoading ? (
            <p className={styles.notice}>
              {pickerQuery.trim()
                ? "No se encontraron productos de Cruzial Import con esa búsqueda."
                : "No hay productos base de Cruzial Import disponibles todavía (Fase 4J3 — extracción del catálogo — aún no se ha ejecutado)."}
            </p>
          ) : (
            <ul className={styles.list} aria-label="Resultados de búsqueda">
              {pickerResults.map((product) => (
                <li
                  key={product.id}
                  className={styles.row}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "10px 14px" }}
                >
                  <div className={styles.rowMain}>
                    <strong>{product.brand ? `${product.brand} — ` : ""}{product.name}</strong>{" "}
                    <span className={`${styles.badge} ${PICKER_PRODUCT_PUBLICATION_CLASS[product.publicationStatus]}`}>
                      {PICKER_PRODUCT_PUBLICATION_LABELS[product.publicationStatus]}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      setSelectedProduct(product);
                      setSelectedVariantId("");
                    }}
                  >
                    {selectedProduct?.id === product.id ? "Seleccionado" : "Elegir"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selectedProduct ? (
            <div className={formStyles.grid}>
              <label className={formStyles.field}>
                <span>Variante (opcional)</span>
                <select
                  value={selectedVariantId}
                  onChange={(event) => setSelectedVariantId(event.target.value)}
                  disabled={selectedProduct.variants.length === 0}
                >
                  <option value="">Producto completo (sin variante)</option>
                  {selectedProduct.variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.label}{variant.sizeMl ? ` · ${variant.sizeMl} ml` : ""} ({PICKER_VARIANT_PUBLICATION_LABELS[variant.publicationStatus]})
                    </option>
                  ))}
                </select>
              </label>
              <label className={formStyles.field}>
                <span>Precio (PEN)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
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
            </div>
          ) : null}

          {addError ? <p className={formStyles.error} role="alert">{addError}</p> : null}
          <div className={`${styles.formActions} ${styles.spacingTop}`}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleAdd}
              disabled={!selectedProduct}
            >
              + Agregar producto
            </button>
          </div>
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
