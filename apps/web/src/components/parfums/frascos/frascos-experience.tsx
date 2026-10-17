"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import {
  catalogQueryToParams,
  DEFAULT_CATALOG_QUERY,
  type CatalogQuery,
  type CatalogSort,
} from "@/domains/catalog/catalog-query";
import { cartIdentity } from "@/domains/catalog/types";
import { SearchIcon } from "@/components/parfums/shell/shell-icons";
import { Reveal } from "@/components/storefront/home/reveal";
import type { FrascosPageData } from "@/lib/catalog/parfums-frascos-page";
import { BottleCard } from "./bottle-card";
import toolbar from "../catalog/catalog-toolbar.module.css";
import styles from "../catalog/catalog.module.css";
import frascos from "./frascos.module.css";

const TYPE_CHIPS = [
  { key: "arab", label: "Árabe" },
  { key: "designer", label: "Diseñador" },
  { key: "niche", label: "Nicho" },
] as const;

const SEARCH_DEBOUNCE_MS = 350;

/**
 * The whole-bottle catalog. Same shape as the decant catalog: the state lives in
 * the URL, the server filters/sorts/paginates and sends one view (`data`), and
 * this component edits that state with `router.replace`, answering chips and
 * the search immediately with `useOptimistic`.
 */
export function FrascosExperience({ data, query }: { data: FrascosPageData; query: CatalogQuery }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(query, (current: CatalogQuery, patch: Partial<CatalogQuery>) => ({ ...current, ...patch }));
  const gridTopRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState("");
  const [searchText, setSearchText] = useState(query.search);
  const [seenSearch, setSeenSearch] = useState(query.search);

  if (query.search !== seenSearch) {
    setSeenSearch(query.search);
    setSearchText(query.search);
  }

  function hrefFor(next: CatalogQuery): string {
    const search = catalogQueryToParams(next).toString();
    return search ? `${pathname}?${search}` : pathname;
  }

  function navigate(patch: Partial<CatalogQuery>) {
    const next: CatalogQuery = { ...query, ...patch, page: patch.page ?? 1 };
    startTransition(() => {
      setOptimistic({ ...patch, page: next.page });
      router.replace(hrefFor(next) as Route, { scroll: false });
    });
  }

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

  const shownPage = useRef(data.page);
  useEffect(() => {
    if (shownPage.current === data.page) return;
    shownPage.current = data.page;
    gridTopRef.current?.scrollIntoView({ block: "start" });
  }, [data.page]);

  function clearFilters() {
    setSearchText("");
    navigate({ ...DEFAULT_CATALOG_QUERY });
  }

  function announceAdded(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  const hasFilters = optimistic.type !== "all" || optimistic.brand !== "all" || optimistic.search.trim() !== "";

  return (
    <>
      <section className={styles.catalogIntro} aria-labelledby="frascos-title">
        <div className={styles.container}>
          <p className={styles.eyebrow}>Perfumes enteros</p>
          <h1 id="frascos-title">Frascos completos</h1>
          <p>Perfumes originales y sellados, en su frasco completo. Los decants de 3, 5 y 10 ml viven en el <Link href={"/parfums/catalogo" as Route}>catálogo</Link>.</p>
        </div>
      </section>

      <section className={styles.catalogLayout} aria-labelledby="frascos-results-title">
        <h2 id="frascos-results-title" className={styles.srOnly}>Catálogo de frascos completos</h2>
        <div className={toolbar.toolbar}>
          <div className={toolbar.container}>
            <div className={toolbar.bar}>
              <label className={toolbar.search}>
                <span className={styles.srOnly}>Buscar perfume entero</span>
                <SearchIcon size={16} />
                <input type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Buscar fragancia o marca" />
                {searchText ? (
                  <button type="button" className={toolbar.searchClear} onClick={() => { setSearchText(""); navigate({ search: "" }); }} aria-label="Borrar búsqueda">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="m2 2 10 10M12 2 2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  </button>
                ) : null}
              </label>
              <div className={toolbar.actions}>
                <label className={`${toolbar.control} ${toolbar.sort}`}>
                  <span>Orden</span>
                  <select aria-label="Ordenar resultados" value={optimistic.sort} onChange={(event) => navigate({ sort: event.target.value as CatalogSort })}>
                    <option value="featured">Destacados</option>
                    <option value="priceAsc">Precio: menor a mayor</option>
                    <option value="priceDesc">Precio: mayor a menor</option>
                    <option value="name">Nombre A–Z</option>
                  </select>
                </label>
              </div>
            </div>
            <div className={toolbar.active}>
              {TYPE_CHIPS.map((chip) => {
                const selected = optimistic.type === chip.key;
                return (
                  <button key={chip.key} type="button" className={toolbar.chip} onClick={() => navigate({ type: selected ? "all" : chip.key })} aria-pressed={selected}>
                    {chip.label} <span aria-hidden="true">·</span> {data.typeCounts[chip.key] ?? 0}
                  </button>
                );
              })}
              <select className={toolbar.brandSelect} aria-label="Filtrar por marca" value={optimistic.brand} onChange={(event) => navigate({ brand: event.target.value })}>
                <option value="all">Todas las marcas</option>
                {data.brands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
              </select>
              {hasFilters ? <button type="button" className={toolbar.clearAll} onClick={clearFilters}>Limpiar todo</button> : null}
            </div>
          </div>
        </div>

        <div className={styles.container}>
          <span className={styles.srOnly} role="status">
            {data.total} {data.total === 1 ? "perfume" : "perfumes"}
            {data.pageCount > 1 ? `, vista ${data.page} de ${data.pageCount}` : ""}
          </span>
          <div ref={gridTopRef} className={styles.gridTop} />
          {data.items.length > 0 ? (
            <ul role="list" data-bottle-grid className={`${frascos.bottleGrid} ${pending ? styles.gridPending : ""}`} aria-busy={pending}>
              {data.items.map((product, index) => (
                <Reveal as="li" key={cartIdentity(product)} className={styles.revealCell} delay={(index % 4) * 60}>
                  <BottleCard product={product} onAdded={announceAdded} eager={index < 4} />
                </Reveal>
              ))}
            </ul>
          ) : (
            <div className={styles.emptyState}>
              <strong>Sin frascos disponibles</strong>
              <p>Prueba ajustando la búsqueda o la marca, o mira los decants de 3, 5 y 10 ml.</p>
              <div className={styles.emptyStateActions}>
                {hasFilters ? <button type="button" onClick={clearFilters}>Limpiar filtros</button> : null}
                <Link href={"/parfums/catalogo" as Route} className={styles.emptyStateFinder}>Ver catálogo de decants <span aria-hidden="true">→</span></Link>
              </div>
            </div>
          )}
          {data.pageCount > 1 ? (
            <nav className={styles.pager} aria-label="Vistas del catálogo" data-frascos-pager>
              <ul>
                {Array.from({ length: data.pageCount }, (_, index) => {
                  const number = index + 1;
                  const current = number === data.page;
                  return (
                    <li key={number}>
                      <Link href={hrefFor({ ...query, page: number }) as Route} scroll={false} className={styles.pagerButton} aria-current={current ? "page" : undefined}>
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

      <div className={`${styles.toast} ${toast ? styles.toastVisible : ""}`} role="status" aria-live="polite">{toast}</div>
    </>
  );
}
