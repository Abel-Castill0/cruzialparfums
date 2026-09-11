"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import styles from "../productos/page.module.css";

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "pending_whatsapp_confirmation", label: "Pendiente" },
  { value: "confirmed", label: "Confirmado" },
  { value: "fulfilled", label: "Completado" },
  { value: "cancelled", label: "Cancelado" },
];

export function OrderFilters({ initial }: { initial: { search: string; status: string } }) {
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
        <label htmlFor="order-search" className={styles.srOnly}>
          Buscar pedido
        </label>
        <input
          id="order-search"
          type="search"
          placeholder="Buscar por número, nombre o teléfono..."
          defaultValue={initial.search}
          onChange={(e) => {
            const value = e.target.value;
            push("q", value);
          }}
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
