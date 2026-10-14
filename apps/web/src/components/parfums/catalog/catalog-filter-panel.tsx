"use client";

import type { CatalogFilters, CatalogSort } from "@/domains/catalog/catalog-query";
import styles from "./catalog-toolbar.module.css";

/**
 * Filters of the Parfums catalog. Budget and "whole bottle" are gone on purpose: the catalog sells decants only (whole
 * bottles live on their own route) and the price is read on each card. The brand list comes from the catalog itself.
 */
export type FilterKey = "type" | "gender" | "family" | "brand";

type Option = { value: string; label: string };

type FilterGroup = { key: FilterKey; label: string; wide?: boolean; options: Option[] };

export const FILTER_GROUPS: ReadonlyArray<FilterGroup> = [
  {
    key: "type",
    label: "Tipo",
    options: [
      { value: "all", label: "Todos" },
      { value: "arab", label: "Árabe" },
      { value: "designer", label: "Diseñador" },
      { value: "niche", label: "Nicho" },
    ],
  },
  {
    key: "gender",
    label: "Género",
    options: [
      { value: "all", label: "Todos" },
      { value: "women", label: "Mujer" },
      { value: "men", label: "Hombre" },
      { value: "unisex", label: "Unisex" },
    ],
  },
  {
    key: "family",
    label: "Familia olfativa",
    wide: true,
    options: [
      { value: "all", label: "Todas" },
      { value: "woody", label: "Amaderado" },
      { value: "floral", label: "Floral" },
      { value: "amber", label: "Ámbar" },
      { value: "citrus", label: "Cítrico" },
      { value: "fresh", label: "Fresco" },
      { value: "gourmand", label: "Gourmand" },
      { value: "spicy", label: "Especiado" },
    ],
  },
  // The brand options are the catalog's own brands, so they are supplied at render time (a long list reads better as a select).
  { key: "brand", label: "Marca", wide: true, options: [{ value: "all", label: "Todas" }] },
];

export const SORT_OPTIONS: ReadonlyArray<{ value: CatalogSort; label: string }> = [
  { value: "featured", label: "Destacados" },
  { value: "priceAsc", label: "Precio: menor a mayor" },
  { value: "priceDesc", label: "Precio: mayor a menor" },
  { value: "name", label: "Nombre A–Z" },
];

export function optionLabel(key: FilterKey, value: string) {
  return FILTER_GROUPS.find((group) => group.key === key)?.options.find((option) => option.value === value)?.label ?? value;
}

/**
 * Filter choices as chips (and a select for brands). One component serves both layouts: an anchored
 * popover on large screens and a bottom sheet on phones (CSS decides).
 */
export function CatalogFilterPanel({
  filters,
  brands,
  resultCount,
  onChange,
  onSort,
  onClear,
  onClose,
}: {
  filters: CatalogFilters;
  brands: readonly string[];
  resultCount: number;
  onChange: <K extends FilterKey>(key: K, value: CatalogFilters[K]) => void;
  onSort: (value: CatalogSort) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className={styles.panelHead}>
        <strong id="catalog-filters-title">Filtrar</strong>
        <button type="button" className={styles.panelClose} onClick={onClose} aria-label="Cerrar filtros">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="m2 2 10 10M12 2 2 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
        </button>
      </div>
      <div className={styles.groups}>
        {FILTER_GROUPS.map((group, groupIndex) => (
          <fieldset key={group.key} className={`${styles.group} ${group.wide ? styles.groupWide : ""}`}>
            <legend>{group.label}</legend>
            {group.key === "brand" ? (
              <select
                className={styles.brandSelect}
                aria-label="Marca"
                value={filters.brand}
                onChange={(event) => onChange("brand", event.target.value)}
              >
                <option value="all">Todas las marcas</option>
                {brands.map((brand) => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
            ) : (
              <div className={styles.chips}>
                {group.options.map((option, optionIndex) => {
                  const selected = filters[group.key] === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={styles.chip}
                      aria-pressed={selected}
                      data-autofocus={groupIndex === 0 && optionIndex === 0 ? "" : undefined}
                      onClick={() => onChange(group.key, option.value as CatalogFilters[typeof group.key])}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>
        ))}
        {/* Phones fold the order control into the sheet; large screens keep the pill. */}
        <fieldset className={`${styles.group} ${styles.groupWide} ${styles.sortGroup}`}>
          <legend>Ordenar por</legend>
          <div className={styles.chips}>
            {SORT_OPTIONS.map((option) => (
              <button key={option.value} type="button" className={styles.chip} aria-pressed={filters.sort === option.value} onClick={() => onSort(option.value)}>
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <div className={styles.panelFoot}>
        <button type="button" className={styles.clearButton} onClick={onClear}>Limpiar todo</button>
        <button type="button" className={styles.applyButton} onClick={onClose}>
          Ver {resultCount} {resultCount === 1 ? "perfume" : "perfumes"}
        </button>
      </div>
    </>
  );
}
