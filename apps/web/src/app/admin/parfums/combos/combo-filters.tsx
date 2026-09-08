"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CompositionVerificationStatus } from "@/domains/admin-parfums/combo-schema";
import { VERIFICATION_STATUS_LABELS } from "@/domains/admin-parfums/combo-schema";
import styles from "../productos/page.module.css";

export function ComboFilters({
  initial,
}: {
  initial: {
    search: string;
    verificationStatus: CompositionVerificationStatus | undefined;
    includeArchived: boolean;
  };
}) {
  const router = useRouter();
  const currentParams = useSearchParams();
  const [search, setSearch] = useState(initial.search);
  const [pending, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function apply(next: Partial<Record<"q" | "verification" | "archived", string>>) {
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
    <div className={styles.filters} role="search" aria-label="Filtrar combos">
      <label className={styles.searchField}>
        <span className={styles.srOnly}>Buscar por nombre o slug del producto</span>
        <input
          type="search"
          value={search}
          onChange={(event) => changeSearch(event.target.value)}
          placeholder="Buscar por nombre o slug del producto…"
        />
      </label>
      <label className={styles.filterField}>
        <span className={styles.srOnly}>Estado de verificación</span>
        <select
          value={initial.verificationStatus ?? ""}
          onChange={(event) => apply({ verification: event.target.value })}
        >
          <option value="">Verificación: todas</option>
          {Object.entries(VERIFICATION_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <label className={styles.checkboxField}>
        <input
          type="checkbox"
          checked={initial.includeArchived}
          onChange={(event) => apply({ archived: event.target.checked ? "1" : "" })}
        />
        Incluir archivados
      </label>
      <span className={styles.filtersStatus} aria-live="polite">{pending ? "Actualizando…" : ""}</span>
    </div>
  );
}
