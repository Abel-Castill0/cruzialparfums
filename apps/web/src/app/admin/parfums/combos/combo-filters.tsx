"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  PERSISTED_VERIFICATION_STATUSES,
  type PersistedCompositionVerificationStatus,
} from "@/domains/admin-parfums/combo-schema";
import { COMBO_VERIFICATION_OWNER_LABELS } from "@/domains/admin-parfums/combo-presentation";
import styles from "@/components/admin/catalog-workspace.module.css";

/** URL-backed filters (q, verification, archived) — deep links keep working
 * and any change resets pagination. */
export function ComboFilters({
  initial,
}: {
  initial: {
    search: string;
    verificationStatus: PersistedCompositionVerificationStatus | undefined;
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
    <div className={styles.filterBar} role="search" aria-label="Filtrar combos">
      <label className={`${styles.field} ${styles.fieldWide}`}>
        <span>Buscar</span>
        <input
          type="search"
          value={search}
          onChange={(event) => changeSearch(event.target.value)}
          placeholder="Nombre del combo o del producto…"
        />
      </label>
      <label className={styles.field}>
        <span>Composición</span>
        <select
          value={initial.verificationStatus ?? ""}
          onChange={(event) => apply({ verification: event.target.value })}
        >
          <option value="">Todas</option>
          {PERSISTED_VERIFICATION_STATUSES.map((value) => (
            <option key={value} value={value}>{COMBO_VERIFICATION_OWNER_LABELS[value]}</option>
          ))}
        </select>
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={initial.includeArchived}
          onChange={(event) => apply({ archived: event.target.checked ? "1" : "" })}
        />
        Incluir archivados
      </label>
      <span className={styles.muted} aria-live="polite">{pending ? "Actualizando…" : ""}</span>
    </div>
  );
}
