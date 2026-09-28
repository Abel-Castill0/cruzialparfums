"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import styles from "@/components/admin/catalog-workspace.module.css";

/** Search + archive scope. Status is chosen with the tabs above; every value
 * stays in the URL (q, status, archived) so links and reloads keep the view. */
export function CustomerFilters({ initial }: { initial: { search: string; status: string; archived: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(initial.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const push = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      startTransition(() => {
        router.push(`?${next.toString()}`);
      });
    },
    [router, searchParams, startTransition],
  );

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return (
    <div className={styles.filterBar} role="search" aria-label="Filtrar clientes">
      <label className={`${styles.field} ${styles.fieldWide}`}>
        <span className={styles.srOnly}>Buscar cliente</span>
        <input
          id="customer-search"
          type="search"
          placeholder="Buscar por nombre o teléfono…"
          value={search}
          onChange={(event) => {
            const value = event.target.value;
            setSearch(value);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => push("q", value), 300);
          }}
        />
      </label>
      <label className={styles.field}>
        <span>Mostrar</span>
        <select value={initial.archived} onChange={(event) => push("archived", event.target.value === "active" ? "" : event.target.value)}>
          <option value="active">Clientes activos</option>
          <option value="archived">Archivados</option>
          <option value="all">Activos y archivados</option>
        </select>
      </label>
      <span className={styles.muted} aria-live="polite">{isPending ? "Actualizando…" : ""}</span>
    </div>
  );
}
