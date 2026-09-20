"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { ProductionStatus, PublicationStatus } from "@/domains/admin-parfums/product-schema";
import styles from "./page.module.css";

export function ProductFilters({
  initial,
}: {
  initial: {
    search: string;
    publicationStatus: PublicationStatus | undefined;
    productionStatus: ProductionStatus | undefined;
    featuredOnly: boolean;
    includeArchived: boolean;
  };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initial.search);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function apply(next: Partial<Record<"q" | "publication" | "production" | "featured" | "archived", string>>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === "") params.delete(key);
      else params.set(key, value);
    }
    params.delete("page"); // any filter change resets pagination
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => apply({ q: value }), 350);
  }

  return (
    <div className={styles.filters} role="search" aria-label="Filtrar productos">
      <label className={styles.searchField}>
        <span className={styles.srOnly}>Buscar por nombre, marca o slug</span>
        <input
          type="search"
          value={search}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Buscar por nombre, marca o slug…"
        />
      </label>

      <label className={styles.filterField}>
        <span className={styles.srOnly}>Estado de publicación</span>
        <select
          value={initial.publicationStatus ?? ""}
          onChange={(event) => apply({ publication: event.target.value })}
        >
          <option value="">Publicación: todas</option>
          <option value="draft">Borrador</option>
          <option value="published">Publicado</option>
          <option value="archived">Archivado</option>
        </select>
      </label>

      <label className={styles.filterField}>
        <span className={styles.srOnly}>Estado de producción</span>
        <select
          value={initial.productionStatus ?? ""}
          onChange={(event) => apply({ production: event.target.value })}
        >
          <option value="">Producción: todas</option>
          <option value="active">Activo</option>
          <option value="discontinued">Descontinuado</option>
        </select>
      </label>

      <label className={styles.checkboxField}>
        <input
          type="checkbox"
          checked={initial.featuredOnly}
          onChange={(event) => apply(event.target.checked ? { featured: "1" } : { featured: "" })}
        />
        Solo destacados
      </label>

      <label className={styles.checkboxField}>
        <input
          type="checkbox"
          checked={initial.includeArchived}
          onChange={(event) => apply(event.target.checked ? { archived: "1" } : { archived: "" })}
        />
        Incluir archivados
      </label>

      <span className={styles.filtersStatus} aria-live="polite">
        {isPending ? "Actualizando…" : ""}
      </span>
    </div>
  );
}
