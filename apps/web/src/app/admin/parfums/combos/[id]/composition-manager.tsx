"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { ComboCompositionItem, ComboProductVariant, ComboRow, EligibleVariant } from "@/domains/admin-parfums/combos-repository";
import { comboPresentationLabel } from "@/domains/admin-parfums/combo-presentation";
import {
  ActionLink,
  AdminSection,
  Notice,
  SaveStatus,
  StatusBadge,
  adminButtonClass,
  type SaveStatusState,
} from "@/components/admin/admin-ui";
import { setComboCompositionAction } from "../actions";
import styles from "@/components/admin/catalog-workspace.module.css";
import comboStyles from "../combos.module.css";

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

export type SavedCompositionSummary = { itemCount: number; hasArchivedItem: boolean };

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

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-PE", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function variantText(label: string, sizeMl: number | null): string {
  return sizeMl !== null && !label.toLowerCase().includes(`${sizeMl} ml`) ? `${label} · ${sizeMl} ml` : label;
}

function validQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity > 0;
}

/**
 * Composition editor. Add/remove/quantity/reorder are LOCAL until "Guardar
 * composición", which sends the whole desired composition as one full
 * replace (admin_set_combo_composition). The combo row's `updated_at` comes
 * from — and goes back to — the shared ComboWorkspace state.
 */
export function CompositionManager({
  comboId,
  comboUpdatedAt,
  verificationStatus,
  onComboChange,
  onSaved,
  onDirtyChange,
  comboProductVariants,
  items,
  eligibleVariants,
  eligibleVariantsFailed,
  productHref,
  canWrite,
  archived,
}: {
  comboId: string;
  comboUpdatedAt: string;
  verificationStatus: string;
  onComboChange: (combo: ComboRow) => void;
  onSaved: (summary: SavedCompositionSummary) => void;
  onDirtyChange: (dirty: boolean) => void;
  comboProductVariants: ComboProductVariant[];
  items: ComboCompositionItem[];
  eligibleVariants: EligibleVariant[];
  eligibleVariantsFailed: boolean;
  productHref: string;
  canWrite: boolean;
  archived: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => items.map(toRow));
  const [baseline, setBaseline] = useState<Row[]>(() => items.map(toRow));
  const [selectedProduct, setSelectedProduct] = useState<Record<string, string>>({});
  const [selectedVariant, setSelectedVariant] = useState<Record<string, string>>({});
  const [newQuantity, setNewQuantity] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const [saveState, setSaveState] = useState<SaveStatusState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [savedMessage, setSavedMessage] = useState("Composición guardada");
  const [addError, setAddError] = useState<Record<string, string>>({});

  const editable = canWrite && !archived;

  const productOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; brand: string | null }>();
    for (const variant of eligibleVariants) {
      if (!map.has(variant.productId)) map.set(variant.productId, { id: variant.productId, name: variant.productName, brand: variant.productBrand });
    }
    return [...map.values()];
  }, [eligibleVariants]);

  const dirty = useMemo(() => !sameComposition(rows, baseline), [rows, baseline]);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const status: SaveStatusState = isPending ? "saving" : saveState === "error" ? "error" : dirty ? "dirty" : saveState;

  function touch() {
    setSaveState("idle");
    setErrorMessage(undefined);
  }

  function handleAdd(comboProductVariantId: string) {
    setAddError((previous) => ({ ...previous, [comboProductVariantId]: "" }));
    const selectedVariantId = selectedVariant[comboProductVariantId] ?? "";
    if (!selectedVariantId) {
      setAddError((previous) => ({ ...previous, [comboProductVariantId]: "Selecciona un producto y su presentación." }));
      return;
    }
    if (rows.some((row) => comboItemKey(row) === `${comboProductVariantId}:${selectedVariantId}`)) {
      setAddError((previous) => ({ ...previous, [comboProductVariantId]: "Esta presentación ya está incluida aquí. Cambia su cantidad en la lista." }));
      return;
    }
    const quantity = Number(newQuantity[comboProductVariantId] ?? "1");
    if (!validQuantity(quantity)) {
      setAddError((previous) => ({ ...previous, [comboProductVariantId]: "La cantidad debe ser un número entero mayor que 0." }));
      return;
    }
    const variant = eligibleVariants.find((candidate) => candidate.id === selectedVariantId);
    if (!variant) {
      setAddError((previous) => ({ ...previous, [comboProductVariantId]: "Esa presentación ya no está disponible. Recarga la página." }));
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
    touch();
  }

  function handleRemove(identity: string) {
    setRows((previous) => previous.filter((row) => comboItemKey(row) !== identity));
    touch();
  }

  function handleQuantityChange(identity: string, value: string) {
    const quantity = value === "" ? Number.NaN : Number(value);
    setRows((previous) => previous.map((row) => comboItemKey(row) === identity ? { ...row, quantity } : row));
    touch();
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
    touch();
  }

  function handleDiscard() {
    setRows(baseline);
    setAddError({});
    touch();
  }

  function handleSave() {
    if (rows.some((row) => !validQuantity(row.quantity))) {
      setErrorMessage("Error — no se guardó. Cada cantidad debe ser un número entero mayor que 0.");
      setSaveState("error");
      return;
    }
    setErrorMessage(undefined);
    setSaveState("idle");
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
        const reset = result.data.combo.composition_verification_status !== verificationStatus
          && result.data.combo.composition_verification_status === "pending_reconfirmation";
        setSavedMessage(reset
          ? "Composición guardada. La verificación volvió a «Necesita reconfirmación»."
          : "Composición guardada");
        onComboChange(result.data.combo);
        setBaseline(rows);
        onSaved({
          itemCount: rows.length,
          hasArchivedItem: rows.some((row) => row.variantArchived || row.productArchived),
        });
        setSaveState("saved");
      } else if (result.status === "field_errors") {
        setErrorMessage(`Error — no se guardó. ${Object.values(result.errors)[0] ?? "Revisa la composición."}`);
        setSaveState("error");
      } else if (result.status === "error") {
        setErrorMessage(`Error — no se guardó. ${result.message}`);
        setSaveState("error");
      }
    });
  }

  return (
    <AdminSection
      id="composicion-seccion"
      title="Composición"
      description="Qué perfumes incluye cada presentación del combo y en qué cantidad. Los cambios se aplican al pulsar “Guardar composición”."
    >
      <div className={styles.cards} aria-busy={isPending}>
        {archived && canWrite ? (
          <Notice tone="neutral" title="El combo está archivado">
            Restáuralo en “Opciones avanzadas” para editar su composición.
          </Notice>
        ) : null}
        {editable && eligibleVariantsFailed ? (
          <Notice tone="attention" title="No pudimos cargar los productos que puedes agregar">
            Recarga la página antes de agregar productos. Puedes seguir cambiando cantidades y orden.
          </Notice>
        ) : null}
        {editable && dirty && (verificationStatus === "official_pdf" || verificationStatus === "client_confirmed") ? (
          <Notice tone="attention" title="Esta composición está verificada">
            Si guardas cambios en sus productos o cantidades, la verificación vuelve a “Necesita reconfirmación” y el combo
            deja de mostrarse hasta que se confirme otra vez. Cambiar solo el orden no la afecta.
          </Notice>
        ) : null}
        {comboProductVariants.length === 0 ? (
          <Notice tone="attention" title="Este combo aún no tiene presentaciones" action={<ActionLink href={productHref}>Abrir producto</ActionLink>}>
            Las presentaciones (por ejemplo, los tamaños del set) se crean en el producto del combo. Después podrás definir qué incluye cada una.
          </Notice>
        ) : null}

        {comboProductVariants.map((presentation) => {
          const groupRows = rows.filter((row) => row.comboProductVariantId === presentation.id);
          const productId = selectedProduct[presentation.id] ?? "";
          const variantOptions = eligibleVariants.filter((variant) => variant.productId === productId);
          const presentationLabel = comboPresentationLabel(presentation);
          const groupEditable = editable && !presentation.archived;
          const headingId = `presentation-${presentation.id}`;
          return (
            <section key={presentation.id} className={`${styles.card} ${comboStyles.group}`} aria-labelledby={headingId}>
              <div className={styles.cardHead}>
                <h3 id={headingId} className={comboStyles.groupTitle}>{presentationLabel}</h3>
                <span className={styles.badges}>
                  <span className={styles.muted}>
                    {groupRows.length} {groupRows.length === 1 ? "producto" : "productos"}
                  </span>
                  {presentation.archived ? <StatusBadge tone="neutral">Presentación archivada · solo lectura</StatusBadge> : null}
                </span>
              </div>

              {groupRows.length === 0 ? (
                <p className={styles.muted}>Esta presentación todavía no incluye productos.</p>
              ) : (
                <ol className={comboStyles.items} aria-label={`Contenido de ${presentationLabel}`}>
                  {groupRows.map((row, index) => {
                    const identity = comboItemKey(row);
                    const rowLabel = `${row.productName} · ${variantText(row.variantLabel, row.variantSizeMl)}`;
                    const quantityValid = validQuantity(row.quantity);
                    return (
                      <li key={identity} className={comboStyles.item}>
                        <span className={comboStyles.position} aria-hidden="true">{index + 1}</span>
                        <span className={comboStyles.itemName}>
                          <strong>{row.productName}</strong>
                          <span className={styles.muted}>
                            {row.productBrand ? `${row.productBrand} · ` : ""}
                            {variantText(row.variantLabel, row.variantSizeMl)} · Precio individual {money(row.priceAmount, row.currency)}
                          </span>
                          {row.productArchived || row.variantArchived ? (
                            <span className={styles.badges}>
                              <StatusBadge tone="attention">{row.productArchived ? "Producto archivado" : "Presentación archivada"}</StatusBadge>
                            </span>
                          ) : null}
                        </span>
                        {groupEditable ? (
                          <>
                            <label className={comboStyles.quantity}>
                              <span>Cantidad</span>
                              <input
                                type="number"
                                min={1}
                                step={1}
                                inputMode="numeric"
                                value={Number.isNaN(row.quantity) ? "" : row.quantity}
                                aria-label={`Cantidad de ${rowLabel}`}
                                aria-invalid={!quantityValid || undefined}
                                onChange={(event) => handleQuantityChange(identity, event.target.value)}
                              />
                            </label>
                            <span className={comboStyles.itemActions}>
                              <button
                                type="button"
                                className={adminButtonClass("quiet")}
                                onClick={() => move(presentation.id, row.productVariantId, -1)}
                                disabled={index === 0 || isPending}
                                aria-label={`Subir ${rowLabel}`}
                              >↑</button>
                              <button
                                type="button"
                                className={adminButtonClass("quiet")}
                                onClick={() => move(presentation.id, row.productVariantId, 1)}
                                disabled={index === groupRows.length - 1 || isPending}
                                aria-label={`Bajar ${rowLabel}`}
                              >↓</button>
                              <button
                                type="button"
                                className={adminButtonClass("quiet")}
                                onClick={() => handleRemove(identity)}
                                disabled={isPending}
                                aria-label={`Quitar ${rowLabel} de ${presentationLabel}`}
                              >Quitar</button>
                            </span>
                          </>
                        ) : (
                          <span className={comboStyles.quantityRead}>
                            <span className={styles.srOnly}>Cantidad: </span>× {row.quantity}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}

              {groupEditable && !eligibleVariantsFailed ? (
                <div className={comboStyles.addRow} role="group" aria-label={`Agregar producto a ${presentationLabel}`}>
                  <label className={styles.field}>
                    <span>Producto</span>
                    <select
                      value={productId}
                      onChange={(event) => {
                        setSelectedProduct((previous) => ({ ...previous, [presentation.id]: event.target.value }));
                        setSelectedVariant((previous) => ({ ...previous, [presentation.id]: "" }));
                      }}
                    >
                      <option value="">Selecciona un producto…</option>
                      {productOptions.map((product) => (
                        <option key={product.id} value={product.id}>{product.brand ? `${product.brand} — ` : ""}{product.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Presentación</span>
                    <select
                      value={selectedVariant[presentation.id] ?? ""}
                      onChange={(event) => setSelectedVariant((previous) => ({ ...previous, [presentation.id]: event.target.value }))}
                      disabled={!productId}
                    >
                      <option value="">{productId ? "Selecciona una presentación…" : "Primero elige un producto"}</option>
                      {variantOptions.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variantText(variant.label, variant.sizeMl)} · {money(variant.priceAmount, variant.currency)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={`${styles.field} ${comboStyles.addQuantity}`}>
                    <span>Cantidad</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={newQuantity[presentation.id] ?? "1"}
                      onChange={(event) => setNewQuantity((previous) => ({ ...previous, [presentation.id]: event.target.value }))}
                    />
                  </label>
                  <button
                    type="button"
                    className={adminButtonClass("secondary")}
                    onClick={() => handleAdd(presentation.id)}
                    disabled={!selectedVariant[presentation.id]}
                  >
                    + Agregar a {presentationLabel}
                  </button>
                  {addError[presentation.id] ? <p className={comboStyles.fieldError} role="alert">{addError[presentation.id]}</p> : null}
                </div>
              ) : null}
            </section>
          );
        })}

        {editable && comboProductVariants.length > 0 ? (
          <div className={`${comboStyles.saveBar} ${dirty ? comboStyles.saveBarDirty : ""}`}>
            <SaveStatus
              state={status}
              message={
                status === "dirty"
                  ? "Cambios sin guardar en la composición"
                  : status === "saved"
                    ? savedMessage
                    : status === "error"
                      ? errorMessage
                      : undefined
              }
            />
            <span className={styles.actionsRow}>
              {dirty ? (
                <button type="button" className={adminButtonClass("quiet")} onClick={handleDiscard} disabled={isPending}>
                  Descartar cambios
                </button>
              ) : null}
              <button type="button" className={adminButtonClass("primary")} onClick={handleSave} disabled={isPending || !dirty}>
                {isPending ? "Guardando…" : "Guardar composición"}
              </button>
            </span>
          </div>
        ) : null}
      </div>
    </AdminSection>
  );
}
