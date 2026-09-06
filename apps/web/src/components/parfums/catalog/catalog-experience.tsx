"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_CATALOG_FILTERS,
  filterCatalogProducts,
  type CatalogFilters,
  type CatalogSort,
} from "@/domains/catalog/catalog-query";
import {
  BOTTLE_GIFT_MESSAGE,
  isBottleGiftEligible,
} from "@/domains/catalog/promotion-eligibility";
import type { CatalogProduct } from "@/domains/catalog/types";
import { SearchIcon } from "@/components/parfums/shell/shell-icons";
import { ProductCard } from "./product-card";
import styles from "./catalog.module.css";

const filterDefinitions = [
  { key: "gender", label: "Género" },
  { key: "family", label: "Familia" },
  { key: "type", label: "Tipo" },
  { key: "format", label: "Formato" },
  { key: "price", label: "Presupuesto" },
] as const;

const labels: Record<string, string> = {
  women: "Mujer",
  men: "Hombre",
  unisex: "Unisex",
  woody: "Amaderado",
  floral: "Floral",
  amber: "Ámbar",
  citrus: "Cítrico",
  fresh: "Fresco",
  gourmand: "Gourmand",
  spicy: "Especiado",
  arab: "Árabe",
  designer: "Designer",
  niche: "Nicho",
  bottle: "Frasco completo",
  "15": "Hasta S/ 15",
  "25": "S/ 16 – S/ 25",
  "26+": "S/ 26 a más",
};

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className={styles.filterGroup}>
      <span className={styles.srOnly}>{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
    </label>
  );
}

export function CatalogExperience({ products, initialFilters }: { products: CatalogProduct[]; initialFilters: CatalogFilters }) {
  const [filters, setFilters] = useState(initialFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [toast, setToast] = useState("");
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const results = useMemo(() => filterCatalogProducts(products, filters), [filters, products]);
  const activeFilters = filterDefinitions.filter(({ key }) => filters[key] !== "all");

  useEffect(() => {
    if (!filtersOpen) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = filterTriggerRef.current;
    document.body.style.overflow = "hidden";
    filterPanelRef.current
      ?.querySelector<HTMLElement>("[data-autofocus]")
      ?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFiltersOpen(false);
        return;
      }
      if (event.key !== "Tab" || !filterPanelRef.current) return;
      const focusable = Array.from(
        filterPanelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [filtersOpen]);

  function updateFilter<K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setFilters(DEFAULT_CATALOG_FILTERS);
  }

  function announceAdded(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  return (
    <>
      <section className={styles.catalogHero}>
        <div className={styles.container}>
          <p className={styles.eyebrow}>Cruzial Parfums</p>
          <h1>Nuestra <em>Colección</em></h1>
          <p>Explora nuestra selección de decants y frascos completos. Filtra por estilo, familia olfativa o presupuesto.</p>
          <Link href={"/parfums/finder" as Route} className={styles.finderCta}>Encontrar mi fragancia <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <section className={styles.catalogLayout} aria-label="Catálogo de perfumes">
        <div className={styles.catalogToolbar}>
          <div className={styles.container}>
            <div className={styles.toolbarRow}>
              <label className={styles.searchField}>
                <span className={styles.srOnly}>Buscar fragancia</span>
                <SearchIcon size={16} />
                <input type="search" value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} placeholder="Buscar fragancia…" />
              </label>
              <button ref={filterTriggerRef} type="button" className={styles.mobileFilterTrigger} onClick={() => setFiltersOpen(true)} aria-expanded={filtersOpen} aria-controls="catalog-filters">Filtrar y ordenar</button>
              <div ref={filterPanelRef} id="catalog-filters" className={`${styles.toolbarControls} ${filtersOpen ? styles.filtersOpen : ""}`}>
                <div className={styles.filterSheetHead}>
                  <strong>Filtrar y ordenar</strong>
                  <button data-autofocus type="button" onClick={() => setFiltersOpen(false)} aria-label="Cerrar filtros">×</button>
                </div>
                <FilterSelect label="Género" value={filters.gender} onChange={(value) => updateFilter("gender", value)}>
                  <option value="all">Todos</option><option value="women">Mujer</option><option value="men">Hombre</option><option value="unisex">Unisex</option>
                </FilterSelect>
                <FilterSelect label="Familia olfativa" value={filters.family} onChange={(value) => updateFilter("family", value)}>
                  <option value="all">Todas las familias</option><option value="woody">Amaderado</option><option value="floral">Floral</option><option value="amber">Ámbar</option><option value="citrus">Cítrico</option><option value="fresh">Fresco</option><option value="gourmand">Gourmand</option><option value="spicy">Especiado</option>
                </FilterSelect>
                <FilterSelect label="Tipo" value={filters.type} onChange={(value) => updateFilter("type", value)}>
                  <option value="all">Todos los tipos</option><option value="arab">Árabe</option><option value="designer">Designer</option><option value="niche">Nicho</option>
                </FilterSelect>
                <FilterSelect label="Formato" value={filters.format} onChange={(value) => updateFilter("format", value)}>
                  <option value="all">Todos los formatos</option><option value="bottle">Frasco completo</option>
                </FilterSelect>
                <FilterSelect label="Presupuesto" value={filters.price} onChange={(value) => updateFilter("price", value)}>
                  <option value="all">Todos los precios</option><option value="15">Hasta S/ 15</option><option value="25">S/ 16 – S/ 25</option><option value="26+">S/ 26 a más</option>
                </FilterSelect>
                <FilterSelect label="Ordenar resultados" value={filters.sort} onChange={(value) => updateFilter("sort", value as CatalogSort)}>
                  <option value="featured">Destacados</option><option value="priceAsc">Precio: menor a mayor</option><option value="priceDesc">Precio: mayor a menor</option><option value="name">Nombre A–Z</option>
                </FilterSelect>
                <button type="button" className={styles.clearFilters} onClick={clearFilters}>Limpiar filtros</button>
                <button type="button" className={styles.applyFilters} onClick={() => setFiltersOpen(false)}>Ver {results.length} resultados</button>
              </div>
            </div>
            {activeFilters.length > 0 ? (
              <div className={styles.activeFilters} aria-live="polite">
                {activeFilters.map(({ key, label }) => (
                  <span className={styles.filterChip} key={key}><b>{label}:</b> {labels[filters[key]] ?? filters[key]}<button type="button" onClick={() => updateFilter(key, "all")} aria-label={`Quitar filtro ${label}`}>×</button></span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <button type="button" aria-label="Cerrar filtros" className={`${styles.filterOverlay} ${filtersOpen ? styles.filterOverlayOpen : ""}`} onClick={() => setFiltersOpen(false)} />

        <div className={styles.container}>
          <div className={styles.resultsTop}>
            <span>{results.length} {results.length === 1 ? "perfume" : "perfumes"}</span>
            {isBottleGiftEligible(filters.format === "bottle" ? "bottle" : "decant") ? (
              <span className={styles.giftNote} data-bottle-gift-note>{BOTTLE_GIFT_MESSAGE}</span>
            ) : null}
          </div>
          {results.length > 0 ? (
            <div data-product-grid className={styles.productGrid}>
              {results.map((product, index) => <ProductCard key={product.legacyId} product={product} mode={filters.format === "bottle" ? "bottle" : "decant"} onAdded={announceAdded} eager={index < 4} />)}
            </div>
          ) : (
            <div className={styles.emptyState}><strong>Sin resultados</strong><p>Prueba ajustando los filtros o buscando otra familia olfativa.</p><button type="button" onClick={clearFilters}>Limpiar filtros</button></div>
          )}
        </div>
      </section>
      <div className={`${styles.toast} ${toast ? styles.toastVisible : ""}`} role="status" aria-live="polite">{toast}</div>
    </>
  );
}
