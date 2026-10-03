"use client";

import type { Route } from "next";
import Image from "next/image";
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
import { RecommendationPanel } from "@/components/parfums/finder/recommendation-panel";
import { finderAnswersToParams } from "@/domains/finder/finder-url";
import type { FinderAnswers } from "@/domains/finder/finder-rules";
import { ProductCard } from "./product-card";
import { CatalogFilterPanel, FILTER_GROUPS, optionLabel, type FilterKey } from "./catalog-filter-panel";
import toolbar from "./catalog-toolbar.module.css";
import styles from "./catalog.module.css";

const discoveryShortcuts = [
  {
    key: "arab",
    label: "Árabe",
    note: "Lattafa, Afnan, Rasasi y más",
    image: "/images/parfums-catalog/catalog-category-arab.webp",
  },
  {
    key: "designer",
    label: "Designer",
    note: "Casas reconocidas internacionalmente",
    image: "/images/parfums-catalog/catalog-category-designer.webp",
  },
  {
    key: "niche",
    label: "Nicho",
    note: "Selección de autor",
    image: "/images/parfums-catalog/catalog-category-niche.webp",
  },
] as const;

const filterDefinitions = FILTER_GROUPS.map(({ key, label }) => ({ key, label }));

export function CatalogExperience({ products, initialFilters, initialRecommendation = null }: {
  products: CatalogProduct[];
  initialFilters: CatalogFilters;
  /** Answers of a completed finder questionnaire, already validated. */
  initialRecommendation?: FinderAnswers | null;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [recommendation, setRecommendation] = useState(initialRecommendation);
  const recommendationRef = useRef<HTMLDivElement>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [toast, setToast] = useState("");
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const results = useMemo(() => filterCatalogProducts(products, filters), [filters, products]);
  const activeFilters = filterDefinitions.filter(({ key }) => filters[key] !== "all");
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const product of products) counts[product.type] = (counts[product.type] ?? 0) + 1;
    return counts;
  }, [products]);

  // Keep the URL in sync with filter/search/sort changes so back/forward,
  // refresh, and sharing a link all preserve the same view — without a
  // Next.js navigation (which would re-render the route) on every
  // keystroke. window.history.replaceState only updates the address bar;
  // filtering itself stays entirely client-side off the `products` prop.
  useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams();
      for (const { key } of filterDefinitions) {
        if (filters[key] !== "all") params.set(key, filters[key]);
      }
      if (filters.sort !== "featured") params.set("sort", filters.sort);
      if (filters.search.trim()) params.set("search", filters.search);
      // A completed recommendation stays in the address so a refresh or a
      // shared link shows the same view.
      if (recommendation) {
        for (const [key, value] of finderAnswersToParams(recommendation)) params.set(key, value);
      }
      const query = params.toString();
      const url = query ? `${window.location.pathname}?${query}` : window.location.pathname;
      window.history.replaceState(null, "", url);
    }, 300);
    return () => clearTimeout(handle);
  }, [filters, recommendation]);

  // Arriving from the questionnaire: bring the recommendation into view and
  // move focus to it so keyboard and screen-reader users land on the result.
  useEffect(() => {
    if (!initialRecommendation) return;
    const panel = recommendationRef.current?.querySelector<HTMLElement>("#recomendacion");
    panel?.scrollIntoView({ block: "start" });
    panel?.focus({ preventScroll: true });
  }, [initialRecommendation]);

  useEffect(() => {
    if (!filtersOpen) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = filterTriggerRef.current;
    // Only the phone sheet is modal; on large screens it is a popover.
    if (window.matchMedia("(max-width: 767px)").matches) document.body.style.overflow = "hidden";
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

  // The questionnaire keeps whatever filters are active when it is opened.
  const finderHref = useMemo(() => {
    const params = new URLSearchParams();
    for (const { key } of filterDefinitions) {
      if (filters[key] !== "all") params.set(key, filters[key]);
    }
    if (filters.sort !== "featured") params.set("sort", filters.sort);
    if (filters.search.trim()) params.set("search", filters.search);
    const query = params.toString();
    return (query ? `/parfums/finder?catalog=${encodeURIComponent(query)}` : "/parfums/finder") as Route;
  }, [filters]);

  function announceAdded(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  return (
    <>
      <section className={styles.catalogHero} data-home-hero>
        <div className={styles.catalogHeroMedia}>
          <Image
            src="/images/parfums-catalog/catalog-hero.webp"
            alt=""
            fill
            sizes="100vw"
            preload
            className={styles.catalogHeroImage}
          />
          <div className={styles.catalogHeroScrim} aria-hidden="true" />
        </div>
        <div className={styles.catalogHeroCopyWrap}>
          <div className={styles.container}>
            <div className={styles.catalogHeroCopy}>
              <p className={styles.eyebrow}>Cruzial Parfums</p>
              <h1>Nuestra <em>Colección</em></h1>
              <p>Explora nuestra selección de decants y frascos completos. Filtra por estilo, familia olfativa o presupuesto.</p>
              <Link href={finderHref} className={styles.finderCta}>Encontrar mi fragancia <span aria-hidden="true">→</span></Link>
            </div>
          </div>
        </div>
      </section>

      {recommendation ? (
        <div className={styles.recommendationBand} ref={recommendationRef}>
          <div className={styles.container}>
            <RecommendationPanel
              products={products}
              answers={recommendation}
              redoHref={finderHref}
              onClear={() => setRecommendation(null)}
              onNotice={announceAdded}
            />
          </div>
        </div>
      ) : null}

      <section className={styles.catalogLayout} aria-label="Catálogo de perfumes">
        <div className={toolbar.toolbar}>
          <div className={toolbar.container}>
            <div className={toolbar.bar}>
              <label className={toolbar.search}>
                <span className={styles.srOnly}>Buscar fragancia</span>
                <SearchIcon size={16} />
                <input type="search" value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} placeholder="Buscar fragancia, marca o nota" />
                {filters.search ? (
                  <button type="button" className={toolbar.searchClear} onClick={() => updateFilter("search", "")} aria-label="Borrar búsqueda">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="m2 2 10 10M12 2 2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  </button>
                ) : null}
              </label>
              <div className={toolbar.actions}>
                <button ref={filterTriggerRef} type="button" className={toolbar.control} onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} aria-haspopup="dialog" aria-controls="catalog-filters">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M2 5h8M14 5h2M2 13h2M8 13h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="12" cy="5" r="2" stroke="currentColor" strokeWidth="1.4" /><circle cx="6" cy="13" r="2" stroke="currentColor" strokeWidth="1.4" /></svg>
                  <span>Filtros</span>
                  {activeFilters.length > 0 ? <b className={toolbar.count} aria-label={`${activeFilters.length} activos`}>{activeFilters.length}</b> : null}
                </button>
                <label className={`${toolbar.control} ${toolbar.sort}`}>
                  <span>Orden</span>
                  <select aria-label="Ordenar resultados" value={filters.sort} onChange={(event) => updateFilter("sort", event.target.value as CatalogSort)}>
                    <option value="featured">Destacados</option>
                    <option value="priceAsc">Precio: menor a mayor</option>
                    <option value="priceDesc">Precio: mayor a menor</option>
                    <option value="name">Nombre A–Z</option>
                  </select>
                </label>
              </div>
              {filtersOpen ? (
                <div ref={filterPanelRef} id="catalog-filters" className={toolbar.panel} role="dialog" aria-modal="true" aria-labelledby="catalog-filters-title">
                  <CatalogFilterPanel
                    filters={filters}
                    resultCount={results.length}
                    onChange={(key, value) => updateFilter(key, value)}
                    onSort={(value) => updateFilter("sort", value)}
                    onClear={clearFilters}
                    onClose={() => setFiltersOpen(false)}
                  />
                </div>
              ) : null}
            </div>
            {activeFilters.length > 0 ? (
              <div className={toolbar.active} aria-live="polite">
                {activeFilters.map(({ key, label }) => (
                  <span className={toolbar.activeChip} key={key}>
                    <small>{label}</small> {optionLabel(key as FilterKey, filters[key])}
                    <button type="button" onClick={() => updateFilter(key, "all")} aria-label={`Quitar filtro ${label}`}>
                      <svg width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="m2 2 10 10M12 2 2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                    </button>
                  </span>
                ))}
                <button type="button" className={toolbar.clearAll} onClick={clearFilters}>Limpiar todo</button>
              </div>
            ) : null}
          </div>
        </div>
        {filtersOpen ? <button type="button" aria-label="Cerrar filtros" tabIndex={-1} className={toolbar.overlay} onClick={() => setFiltersOpen(false)} /> : null}

        <nav className={toolbar.doors} aria-label="Explorar por categoría">
          <div className={toolbar.container}>
            <ul className={toolbar.doorList}>
              {discoveryShortcuts.map((category) => {
                const selected = filters.type === category.key;
                return (
                  <li key={category.key}>
                    <button
                      type="button"
                      className={toolbar.door}
                      onClick={() => updateFilter("type", selected ? "all" : category.key)}
                      aria-pressed={selected}
                    >
                      <Image src={category.image} alt="" fill sizes="(max-width: 1240px) 33vw, 400px" className={toolbar.doorImage} />
                      <span className={toolbar.doorBody}>
                        <span className={toolbar.doorLabel}>{category.label}</span>
                        <span className={toolbar.doorNote}>{category.note}</span>
                        <span className={toolbar.doorCount}>{typeCounts[category.key] ?? 0} fragancias</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

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
            <div className={styles.emptyState}>
              <strong>Sin resultados</strong>
              <p>Prueba ajustando los filtros o buscando otra familia olfativa.</p>
              <div className={styles.emptyStateActions}>
                <button type="button" onClick={clearFilters}>Limpiar filtros</button>
                <Link href={finderHref} className={styles.emptyStateFinder}>Usar el Finder <span aria-hidden="true">→</span></Link>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className={styles.catalogFooterBand} aria-labelledby="catalog-footer-band-title">
        <div className={styles.catalogFooterBandMedia}>
          <Image
            src="/images/parfums-catalog/catalog-footer-editorial.webp"
            alt=""
            fill
            sizes="100vw"
            className={styles.catalogFooterBandImage}
          />
          <div className={styles.catalogFooterBandScrim} aria-hidden="true" />
        </div>
        <div className={styles.catalogFooterBandCopy}>
          <div className={styles.container}>
            <p className={styles.eyebrow}>Cruzial Parfums</p>
            <h2 id="catalog-footer-band-title">¿No encuentras tu <em>fragancia</em>?</h2>
            <Link href={finderHref} className={styles.catalogFooterBandCta}>Usar el Finder <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </section>

      <div className={`${styles.toast} ${toast ? styles.toastVisible : ""}`} role="status" aria-live="polite">{toast}</div>
    </>
  );
}
