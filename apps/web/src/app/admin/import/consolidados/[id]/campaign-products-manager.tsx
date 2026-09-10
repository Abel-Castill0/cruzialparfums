"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type {
  CampaignProductItem,
  EligibleImportProduct,
  ImportPresentationClass,
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
  type ImportPresentationPublicationStatus,
  type VariantPublicationStatus,
} from "@/domains/admin-import/campaign-readiness";
import {
  campaignRowKey,
  campaignRowsDirty,
  filterCampaignRows,
  moveCampaignRow,
  paginateCampaignRows,
  serializeCampaignRows,
  updateCampaignRow,
} from "@/domains/admin-import/campaign-table-model";
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

const PRESENTATION_CLASS_LABELS: Record<ImportPresentationClass, string> = {
  single_fixed: "Presentación única",
  multi_presentation: "Presentación múltiple",
  pack_set: "Pack / set",
  ambiguous: "Presentación ambigua",
};

const PICKER_PRESENTATION_PUBLICATION_LABELS: Record<Exclude<ImportPresentationPublicationStatus, "archived">, string> = {
  published: "Publicada",
  draft: "Borrador — no lista públicamente",
};

type Row = {
  productId: string;
  productVariantId: string | null;
  importPresentationId: string | null;
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
  presentationLabel: string | null;
  presentationClass: ImportPresentationClass | null;
  presentationCapacityMl: number | null;
  presentationArchived: boolean;
  presentationArchivedAt: string | null;
  presentationPublicationStatus: ImportPresentationPublicationStatus | null;
};

function toRow(item: CampaignProductItem): Row {
  return {
    productId: item.productId,
    productVariantId: item.productVariantId,
    importPresentationId: item.importPresentationId,
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
    presentationLabel: item.presentationLabel,
    presentationClass: item.presentationClass,
    presentationCapacityMl: item.presentationCapacityMl,
    presentationArchived: item.presentationArchived,
    presentationArchivedAt: item.presentationArchivedAt,
    presentationPublicationStatus: item.presentationPublicationStatus,
  };
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
  const [selectedPresentationId, setSelectedPresentationId] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newAvailability, setNewAvailability] = useState<CampaignProductAvailability>("unconfirmed");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [tableQuery, setTableQuery] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState<"all" | CampaignProductAvailability>("all");
  const [tablePage, setTablePage] = useState(1);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dirty = useMemo(() => campaignRowsDirty(rows, baseline), [rows, baseline]);
  const filteredRows = useMemo(() => filterCampaignRows(rows, tableQuery, availabilityFilter), [rows, tableQuery, availabilityFilter]);
  const pageWindow = useMemo(() => paginateCampaignRows(filteredRows, tablePage, 40), [filteredRows, tablePage]);
  const filtersActive = tableQuery.trim().length > 0 || availabilityFilter !== "all";

  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

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
          importPresentationId: row.importPresentationId,
          presentationPublicationStatus: row.presentationPublicationStatus,
          presentationArchivedAt: row.presentationArchivedAt,
          availabilityStatus: row.availabilityStatus,
        }),
      ),
    [rows, campaignStatus, campaignArchivedAt],
  );

  const summary = useMemo(() => {
    const visible = readiness.filter((r) => r.isPubliclyVisible).length;
    const outOfStock = readiness.filter((r) => r.availability === "out_of_stock").length;
    const unconfirmed = readiness.filter((r) => r.availability === "unconfirmed").length;
    return {
      configured: rows.length,
      visible,
      blocked: rows.length - visible,
      outOfStock,
      unconfirmed,
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
    const presentationId = selectedPresentationId || null;
    if (selectedProduct.presentations.length > 0 && presentationId === null) {
      setAddError("Selecciona una presentación Import.");
      return;
    }
    const dedupe = `${selectedProduct.id}::::${presentationId ?? ""}`;
    if (rows.some((row) => campaignRowKey(row) === dedupe)) {
      setAddError("Este producto con esa presentación ya está en la lista.");
      return;
    }
    if (!isValidMoneyText(newPrice)) {
      setAddError("Ingresa un precio válido: solo dígitos y hasta 2 decimales, sin signo (ej. 16.50).");
      return;
    }
    const price = normalizeMoneyText(newPrice);
    const presentation = presentationId
      ? selectedProduct.presentations.find((candidate) => candidate.id === presentationId)
      : null;
    if (presentationId && !presentation) {
      setAddError("Esa presentación ya no está disponible. Vuelve a buscar.");
      return;
    }

    setRows((previous) => [
      ...previous,
      {
        productId: selectedProduct.id,
        productVariantId: null,
        importPresentationId: presentationId,
        priceAmount: price,
        availabilityStatus: newAvailability,
        productName: selectedProduct.name,
        variantLabel: null,
        productArchived: false,
        variantArchived: false,
        productArchivedAt: null,
        productPublicationStatus: selectedProduct.publicationStatus,
        variantArchivedAt: null,
        variantPublicationStatus: null,
        presentationLabel: presentation?.label ?? null,
        presentationClass: presentation?.presentationClass ?? null,
        presentationCapacityMl: presentation?.capacityMl ?? null,
        presentationArchived: false,
        presentationArchivedAt: null,
        presentationPublicationStatus: presentation?.publicationStatus ?? null,
      },
    ]);
    setSelectedPresentationId("");
    setNewPrice("");
    setNewAvailability("unconfirmed");
    setSaved(false);
  }

  function handleRemove(key: string) {
    setRows((previous) => previous.filter((row) => campaignRowKey(row) !== key));
    setSaved(false);
  }

  function handlePriceChange(key: string, value: string) {
    // Kept as raw text while typing (never Number()) — validity is checked
    // at save time by validateCampaignProductItems, same contract as the
    // server. sameSet/dirty compares the raw text directly.
    setRows((previous) => updateCampaignRow(previous, key, { priceAmount: value }));
    setSaved(false);
  }

  function handleAvailabilityChange(key: string, value: CampaignProductAvailability) {
    setRows((previous) => updateCampaignRow(previous, key, { availabilityStatus: value }));
    setSaved(false);
  }

  function moveTo(key: string, position: number) {
    setRows((previous) => moveCampaignRow(previous, key, position));
    setSaved(false);
  }

  function handleSave() {
    setError(null);
    setFieldErrors({});
    // A previous successful save must not remain visible while a new full
    // replace is in flight; success belongs only to the server-confirmed
    // submission currently being handled.
    setSaved(false);
    startTransition(async () => {
      // quantity_limit is never sent — it is not browser-authoritative
      // (4J2 correction). The RPC preserves each existing association's
      // value by itself.
      const payload = serializeCampaignRows(rows);
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
        <div><dt>Por confirmar</dt><dd>{summary.unconfirmed}</dd></div>
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

      {rows.length > 0 ? (
        <div className={styles.filters}>
          <label className={styles.searchField}>
            <span className={styles.srOnly}>Buscar dentro del consolidado</span>
            <input value={tableQuery} placeholder="Buscar producto o presentación" onChange={(event) => { setTableQuery(event.target.value); setTablePage(1); }} />
          </label>
          <label className={styles.filterField}>
            <span className={styles.srOnly}>Filtrar disponibilidad</span>
            <select value={availabilityFilter} onChange={(event) => { setAvailabilityFilter(event.target.value as "all" | CampaignProductAvailability); setTablePage(1); }}>
              <option value="all">Toda disponibilidad</option><option value="unconfirmed">Por confirmar</option><option value="available">Disponible</option><option value="out_of_stock">Agotado</option>
            </select>
          </label>
          <span className={styles.filtersStatus}>Mostrando {pageWindow.from}–{pageWindow.to} de {pageWindow.total} ({rows.length} totales)</span>
        </div>
      ) : null}

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
            {pageWindow.items.map((row) => {
              const key = campaignRowKey(row);
              const index = rows.findIndex((candidate) => campaignRowKey(candidate) === key);
              const structureLabel = row.presentationLabel ?? row.variantLabel;
              const rowLabel = structureLabel ? `${row.productName} · ${structureLabel}` : row.productName;
              const rowReadiness = readiness[index];
              return (
                <tr key={key}>
                  <td data-label="Producto">
                    {row.productName}
                    {structureLabel ? ` · ${structureLabel}` : ""}
                    {row.presentationCapacityMl ? ` · ${row.presentationCapacityMl} ml` : ""}
                    {row.presentationClass ? ` · ${PRESENTATION_CLASS_LABELS[row.presentationClass]}` : ""}
                    {row.productArchived ? <span className={styles.badgeArchived}> Producto archivado</span> : null}
                    {row.variantArchived ? <span className={styles.badgeArchived}> Variante archivada</span> : null}
                    {row.presentationArchived ? <span className={styles.badgeArchived}> Presentación archivada</span> : null}
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
                        <option value="unconfirmed">{AVAILABILITY_LABELS.unconfirmed}</option>
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
                    {!disabled && !filtersActive ? (
                      <label className={formStyles.field}><span className={styles.srOnly}>Posición de {rowLabel}</span><input type="number" inputMode="numeric" min={1} max={rows.length} defaultValue={index + 1} key={`${key}:${index}`} onBlur={(event) => moveTo(key, Number(event.target.value))} style={{ width: "76px" }} /></label>
                    ) : null}
                    {filtersActive ? <span className={styles.rowMeta}>Quita filtros para reordenar</span> : null}
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

      {pageWindow.pages > 1 ? <nav className={styles.pagination} aria-label="Páginas del consolidado"><button type="button" className={styles.secondaryButton} disabled={pageWindow.page === 1} onClick={() => setTablePage((page) => Math.max(1, page - 1))}>← Anterior</button><span>Página {pageWindow.page} de {pageWindow.pages}</span><button type="button" className={styles.secondaryButton} disabled={pageWindow.page === pageWindow.pages} onClick={() => setTablePage((page) => Math.min(pageWindow.pages, page + 1))}>Siguiente →</button></nav> : null}

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
                setSelectedPresentationId("");
              }}
              placeholder="Ej. Armaf, Club de Nuit…"
            />
          </label>

          {pickerLoading ? <p className={styles.notice}>Buscando…</p> : null}

          {pickerResults.length === 0 && !pickerLoading ? (
            <p className={styles.notice}>
              {pickerQuery.trim()
                ? "No se encontraron productos de Cruzial Import con esa búsqueda."
                : "No hay productos activos disponibles para agregar."}
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
                      setSelectedPresentationId("");
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
                <span>Presentación Import{selectedProduct.presentations.length === 0 ? " (producto completo)" : ""}</span>
                <select
                  value={selectedPresentationId}
                  onChange={(event) => setSelectedPresentationId(event.target.value)}
                  disabled={selectedProduct.presentations.length === 0}
                >
                  <option value="">{selectedProduct.presentations.length === 0 ? "Producto completo" : "Selecciona una presentación"}</option>
                  {selectedProduct.presentations.map((presentation) => (
                    <option key={presentation.id} value={presentation.id}>
                      {presentation.label}{presentation.capacityMl ? ` · ${presentation.capacityMl} ml` : ""} · {PRESENTATION_CLASS_LABELS[presentation.presentationClass]} ({PICKER_PRESENTATION_PUBLICATION_LABELS[presentation.publicationStatus]})
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
                  <option value="unconfirmed">{AVAILABILITY_LABELS.unconfirmed}</option>
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
