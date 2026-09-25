"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ORDER_AGE_BUCKETS, ORDER_AGE_LABELS } from "@/domains/admin/order-age";
import styles from "./order-filters.module.css";

export type OrderStatusOption = { value: string; label: string };

/** Shared order-inbox filter bar for Parfums and Import — same URL-state
 * rules (search/status/age live in searchParams so back/refresh/shared
 * links and Action Center deep links all work), same age buckets, each
 * unit supplying its own truthful status labels. */
export function OrderFilters({
  statusOptions,
  initial,
}: {
  statusOptions: readonly OrderStatusOption[];
  initial: { search: string; status: string; age: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(initial.search);
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

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchValue(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => push("q", value), 300);
    },
    [push],
  );

  return (
    <div className={styles.filters}>
      <div className={styles.searchField}>
        <label htmlFor="order-search" className={styles.srOnly}>
          Buscar pedido
        </label>
        <input
          id="order-search"
          type="search"
          placeholder="Buscar por número, nombre o teléfono..."
          value={searchValue}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
      </div>
      <div className={styles.filterField}>
        <label htmlFor="order-status" className={styles.srOnly}>
          Estado
        </label>
        <select
          id="order-status"
          defaultValue={initial.status}
          onChange={(e) => push("status", e.target.value)}
        >
          <option value="">Todos los estados</option>
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.filterField}>
        <label htmlFor="order-age" className={styles.srOnly}>
          Antigüedad
        </label>
        <select id="order-age" defaultValue={initial.age} onChange={(e) => push("age", e.target.value)}>
          <option value="">Cualquier antigüedad</option>
          {ORDER_AGE_BUCKETS.map((bucket) => (
            <option key={bucket} value={bucket}>
              {ORDER_AGE_LABELS[bucket]}
            </option>
          ))}
        </select>
      </div>
      <span className={styles.status} role="status" aria-live="polite">
        {isPending ? "Actualizando…" : ""}
      </span>
    </div>
  );
}
