"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { COMPLAINT_STATUS_LABELS } from "@/domains/complaints/complaint-schema";
import { COMPLAINT_URGENCY_LABELS } from "@/domains/complaints/sla";
import styles from "../productos/page.module.css";

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "received", label: COMPLAINT_STATUS_LABELS.received },
  { value: "in_review", label: COMPLAINT_STATUS_LABELS.in_review },
  { value: "resolved", label: COMPLAINT_STATUS_LABELS.resolved },
];

export function ComplaintFilters({ initial }: { initial: { search: string; status: string; urgency: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const push = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      startTransition(() => router.push(`?${next.toString()}`));
    },
    [router, searchParams, startTransition],
  );

  return (
    <div className={styles.filters}>
      <div className={styles.searchField}>
        <label htmlFor="complaint-search" className={styles.srOnly}>Buscar reclamo</label>
        <input
          id="complaint-search"
          type="search"
          placeholder="Buscar por nombre, teléfono o documento..."
          defaultValue={initial.search}
          onChange={(e) => push("q", e.target.value)}
        />
      </div>
      <div className={styles.filterField}>
        <label htmlFor="complaint-status" className={styles.srOnly}>Estado</label>
        <select id="complaint-status" defaultValue={initial.status} onChange={(e) => push("status", e.target.value)}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <div className={styles.filterField}>
        <label htmlFor="complaint-urgency">Plazo</label>
        <select id="complaint-urgency" defaultValue={initial.urgency} onChange={(e) => push("urgency", e.target.value)}>
          <option value="">Todos los plazos</option>
          {Object.entries(COMPLAINT_URGENCY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
    </div>
  );
}
