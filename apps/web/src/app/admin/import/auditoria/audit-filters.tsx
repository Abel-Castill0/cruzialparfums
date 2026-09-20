"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { KNOWN_ACTIONS, KNOWN_ENTITY_TYPES, actionLabel, entityTypeLabel } from "@/domains/admin-parfums/audit-log-schema";
import styles from "../productos/page.module.css";

export function AuditFilters({
  initial,
}: {
  initial: { action: string; entityType: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function apply(next: Partial<Record<"action" | "entity", string>>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === "") params.delete(key);
      else params.set(key, value);
    }
    params.delete("page");
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }

  return (
    <div className={styles.filters} role="search" aria-label="Filtrar auditoría">
      <label className={styles.filterField}>
        <span className={styles.srOnly}>Acción</span>
        <select value={initial.action} onChange={(event) => apply({ action: event.target.value })}>
          <option value="">Acción: todas</option>
          {KNOWN_ACTIONS.map((action) => (
            <option key={action} value={action}>{actionLabel(action)}</option>
          ))}
        </select>
      </label>

      <label className={styles.filterField}>
        <span className={styles.srOnly}>Tipo de entidad</span>
        <select value={initial.entityType} onChange={(event) => apply({ entity: event.target.value })}>
          <option value="">Entidad: todas</option>
          {KNOWN_ENTITY_TYPES.map((entityType) => (
            <option key={entityType} value={entityType}>{entityTypeLabel(entityType)}</option>
          ))}
        </select>
      </label>

      <span className={styles.filtersStatus} aria-live="polite">
        {isPending ? "Actualizando…" : ""}
      </span>
    </div>
  );
}
