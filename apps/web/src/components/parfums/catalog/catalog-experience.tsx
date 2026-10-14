"use client";

import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import {
  catalogQueryToParams,
  DEFAULT_CATALOG_QUERY,
  type CatalogQuery,
  type CatalogSort,
} from "@/domains/catalog/catalog-query";
import { cartIdentity, type CatalogProduct } from "@/domains/catalog/types";
import { SearchIcon } from "@/components/parfums/shell/shell-icons";
import { RecommendationPanel } from "@/components/parfums/finder/recommendation-panel";
import { recommendationQueryString, withoutRecommendation } from "@/domains/finder/finder-url";
import type { FinderAnswers } from "@/domains/finder/finder-rules";
import { Reveal } from "@/components/storefront/home/reveal";
import type { CatalogPageData } from "@/lib/catalog/parfums-catalog-page";
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
    label: "Diseñador",
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

const SEARCH_DEBOUNCE_MS = 350;

/**
 * The Parfums catalog. The state of the catalog lives in the URL (`searchParams`): the server reads it, filters, sorts and
 * paginates, and sends only the requested view (`data`, 24 card products plus the small facets). This component edits that
 * state with `router.replace`; chips and category cards answer immediately (`useOptimistic`) while the new view loads.
 */
export function CatalogExperience({ data, query, recommendation = null }: {
  data: CatalogPageData;
  /** The state the server rendered `data` for. */
  query: CatalogQuery;
  /** A completed finder questionnaire and the few products the server picked for it. */
  recommendation?: { answers: FinderAnswers; products: CatalogProduct[] } | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(query, (current: CatalogQuery, patch: Partial<CatalogQuery>) => ({ ...current, ...patch }));
  const gridTopRef = useRef<HTMLDivElement>(null);
  const recommendationRef = useRef<HTMLDivElement>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [toast, setToast] = useState("");
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const [searchText, setSearchText] = useState(query.search);
  const [seenSearch, setSeenSearch] = useState(query.search);
  const activeFilters = filterDefinitions.filter(({ key }) => optimistic[key] !== "all");

  // The URL changed from outside (back/forward, a shared link): the input follows it.
  if (query.search !== seenSearch) {
    setSeenSearch(query.search);
    setSearchText(query.search);
  }

  /** Catalog URL for a state, keeping a finder recommendation if there is one. */
  function hrefFor(next: CatalogQuery): string {
    const params = catalogQueryToParams(next);
    for (const [key, value] of new URLSearchParams(recommendationQueryString(searchParams))) params.set(key, value);
    const search = params.toString();
    return search ? `${pathname}?${search}` : pathname;
  }

  // Any change to what is listed starts again from the first view; the pager is the only way to keep a page.
  function navigate(patch: Partial<CatalogQuery>) {
    const next: CatalogQuery = { ...query, ...patch, page: patch.page ?? 1 };
    startTransition(() => {
      setOptimistic({ ...patch, page: next.page });
      router.replace(hrefFor(next) as Route, { scroll: false });
    });
  }

  // Typing does not navigate on every key: the search goes to the URL after a short pause.
  useEffect(() => {
    if (searchText.trim() === query.search) return undefined;
    const handle = setTimeout(() => {
      const next: CatalogQuery = { ...query, search: searchText.trim(), page: 1 };
      startTransition(() => {
        setOptimistic({ search: next.search, page: 1 });
        router.replace(hrefFor(next) as Route, { scroll: false });
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hrefFor/startTransition are recreated each render; the inputs that matter are listed
  }, [searchText, query]);

  // A new view (pager, or ?vista= changing) brings its first row into sight; the first render never scrolls.
  const shownPage = useRef(data.page);
  useEffect(() => {
    if (shownPage.current === data.page) return;
    shownPage.current = data.page;
    gridTopRef.current?.scrollIntoView({ block: "start" });
  }, [data.page]);

  // Arriving from the questionnaire: bring the recommendation into view and
  // move focus to it so keyboard and screen-reader users land on the result.
  useEffect(() => {
    if (!recommendation) return;
    const panel = recommendationRef.current?.querySelector<HTMLElement>("#recomendacion");
    panel?.scrollIntoView({ block: "start" });
    panel?.focus({ preventScroll: true });
  }, [recommendation]);

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

  function updateFilter<K extends keyof CatalogQuery>(key: K, value: CatalogQuery[K]) {
    navigate({ [key]: value } as Partial<CatalogQuery>);
  }

  function clearFilters() {
    setSearchText("");
    navigate({ ...DEFAULT_CATALOG_QUERY });
  }

  // The questionnaire keeps whatever filters are active when it is opened.
  const finderHref = useMemo(() => {
    const params = catalogQueryToParams({ ...optimistic, page: 1 });
    const text = params.toString();
    return (text ? `/parfums/finder?catalog=${encodeURIComponent(text)}` : "/parfums/finder") as Route;
  }, [optimistic]);

  function announceAdded(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  return (
    <>
      <section className={styles.catalogIntro} aria-labelledby="catalog-title">
        <div className={styles.container}>
          <h1 id="catalog-title">Nuestra Colección</h1>
          <p>Decants de 3, 5 y 10 ml de fragancias originales.</p>
        </div>
      </section>

      {recommendation ? (
        <div className={styles.recommendationBand} ref={recommendationRef}>
          <div className={styles.container}>
            <RecommendationPanel
              products={recommendation.products}
              answers={recommendation.answers}
              redoHref={finderHref}
              onClear={() => {
                const search = withoutRecommendation(searchParams.toString());
                startTransition(() => router.replace((search ? `${pathname}?${search}` : pathname) as Route, { scroll: false }));
              }}
              onNotice={announceAdded}
            />
          </div>
        </div>
      ) : null}

      <section className={styles.catalogLayout} aria-labelledby="catalog-results-title">
        <h2 id="catalog-results-title" className={styles.srOnly}>Catálogo de perfumes</h2>
        <nav className={toolbar.doors} aria-label="Explorar por categoría">
          <div className={toolbar.container}>
            <ul className={toolbar.doorList}>
              {discoveryShortcuts.map((category) => {
                const selected = optimistic.type === category.key;
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
                        <span className={toolbar.doorCount}>{data.typeCounts[category.key] ?? 0} fragancias</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        <div className={toolbar.toolbar}>
          <div className={toolbar.container}>
            <div className={toolbar.bar}>
              <label className={toolbar.search}>
                <span className={styles.srOnly}>Buscar fragancia</span>
                <SearchIcon size={16} />
                <input type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Buscar fragancia, marca o nota" />
                {searchText ? (
                  <button type="button" className={toolbar.searchClear} onClick={() => { setSearchText(""); updateFilter("search", ""); }} aria-label="Borrar búsqueda">
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
                  <select aria-label="Ordenar resultados" value={optimistic.sort} onChange={(event) => updateFilter("sort", event.target.value as CatalogSort)}>
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
                    filters={optimistic}
                    brands={data.brands}
                    resultCount={data.total}
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
                    <small>{label}</small> {optionLabel(key as FilterKey, optimistic[key])}
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


        <div className={styles.container}>
          {/* The visible "N perfumes" count was noise; screen readers still hear how many results a filter leaves. */}
          <span className={styles.srOnly} role="status">
            {data.total} {data.total === 1 ? "perfume" : "perfumes"}
            {data.pageCount > 1 ? `, vista ${data.page} de ${data.pageCount}` : ""}
          </span>
          <div ref={gridTopRef} className={styles.gridTop} />
          {data.items.length > 0 ? (
            <ul role="list" data-product-grid className={`${styles.productGrid} ${pending ? styles.gridPending : ""}`} aria-busy={pending}>
              {data.items.map((product, index) => (
                <Reveal as="li" key={cartIdentity(product)} className={styles.revealCell} delay={(index % 4) * 60}>
                  <ProductCard product={product} onAdded={announceAdded} eager={index < 4} />
                </Reveal>
              ))}
            </ul>
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
          {data.pageCount > 1 ? (
            <nav className={styles.pager} aria-label="Vistas del catálogo" data-catalog-pager>
              <ul>
                {Array.from({ length: data.pageCount }, (_, index) => {
                  const number = index + 1;
                  const current = number === data.page;
                  return (
                    <li key={number}>
                      <Link
                        href={hrefFor({ ...query, page: number }) as Route}
                        scroll={false}
                        className={styles.pagerButton}
                        aria-current={current ? "page" : undefined}
                      >
                        Vista {number}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : null}
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
            <h2 id="catalog-footer-band-title">¿No encuentras tu <em>fragancia</em>?</h2>
            <Link href={finderHref} className={styles.catalogFooterBandCta}>Usar el Finder <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </section>

      <div className={`${styles.toast} ${toast ? styles.toastVisible : ""}`} role="status" aria-live="polite">{toast}</div>
    </>
  );
}
