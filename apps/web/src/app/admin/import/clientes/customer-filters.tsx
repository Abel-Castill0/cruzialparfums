"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import styles from "../productos/page.module.css";

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "pending_verification", label: "Pendiente" },
  { value: "new", label: "Nuevo" },
  { value: "returning", label: "Recurrente" },
];

export function CustomerFilters({ initial }: { initial: { search: string; status: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const push = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      next.delete("page");
      startTransition(() => {
        router.push(`?${next.toString()}`);
      });
    },
    [router, searchParams, startTransition],
  );

  return (
    <div className={styles.filters}>
      <div className={styles.searchField}>
        <label htmlFor="customer-search" className={styles.srOnly}>
          Buscar cliente
        </label>
        <input
          id="customer-search"
          type="search"
          placeholder="Buscar por nombre o teléfono..."
          defaultValue={initial.search}
          onChange={(e) => {
            const value = e.target.value;
            push("q", value);
          }}
        />
      </div>
      <div className={styles.filterField}>
        <label htmlFor="customer-status" className={styles.srOnly}>
          Estado
        </label>
        <select
          id="customer-status"
          defaultValue={initial.status}
          onChange={(e) => push("status", e.target.value)}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
