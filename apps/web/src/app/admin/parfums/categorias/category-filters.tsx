"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CategoryKind, CategoryPublicationStatus } from "@/domains/admin-parfums/category-schema";
import styles from "../productos/page.module.css";

export function CategoryFilters({
  initial,
}: {
  initial: {
    search: string;
    publicationStatus: CategoryPublicationStatus | "archived" | undefined;
    kind: CategoryKind | undefined;
    includeArchived: boolean;
  };
}) {
  const router = useRouter();
  const currentParams = useSearchParams();
  const [search, setSearch] = useState(initial.search);
  const [pending, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function apply(next: Partial<Record<"q" | "publication" | "kind" | "archived", string>>) {
    const params = new URLSearchParams(currentParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    params.delete("page");
    startTransition(() => router.push(`?${params.toString()}`));
  }

  function changeSearch(value: string) {
    setSearch(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => apply({ q: value }), 350);
  }

  return (
    <div className={styles.filters} role="search" aria-label="Filtrar categorías">
      <label className={styles.searchField}>
        <span className={styles.srOnly}>Buscar por nombre o slug</span>
        <input type="search" value={search} onChange={(event) => changeSearch(event.target.value)} placeholder="Buscar por nombre o slug…" />
      </label>
      <label className={styles.filterField}>
        <span className={styles.srOnly}>Estado de publicación</span>
        <select
          value={initial.publicationStatus ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            apply(value === "archived" ? { publication: value, archived: "1" } : { publication: value });
          }}
        >
          <option value="">Publicación: todas</option>
          <option value="draft">Borrador</option>
          <option value="published">Publicado</option>
          <option value="archived">Archivado</option>
        </select>
      </label>
      <label className={styles.filterField}>
        <span className={styles.srOnly}>Tipo de categoría</span>
        <select value={initial.kind ?? ""} onChange={(event) => apply({ kind: event.target.value })}>
          <option value="">Tipo: todos</option>
          <option value="commercial_type">Tipo comercial</option>
          <option value="olfactory_family">Familia olfativa</option>
        </select>
      </label>
      <label className={styles.checkboxField}>
        <input
          type="checkbox"
          checked={initial.includeArchived}
          onChange={(event) => apply(event.target.checked
            ? { archived: "1" }
            : { archived: "", ...(initial.publicationStatus === "archived" ? { publication: "" } : {}) })}
        />
        Incluir archivadas
      </label>
      <span className={styles.filtersStatus} aria-live="polite">{pending ? "Actualizando…" : ""}</span>
    </div>
  );
}
