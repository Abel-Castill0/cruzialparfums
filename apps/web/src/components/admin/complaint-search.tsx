"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import catalogStyles from "./catalog-workspace.module.css";

/** Shared search box for the Parfums/Import complaint inboxes. Status lives
 * in the filter tabs (Phase C1); this only ever touches `q` and resets
 * pagination, same URL-state rules as OrderFilters. */
export function ComplaintSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(initial);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const handleChange = useCallback(
    (next: string) => {
      setValue(next);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (next) params.set("q", next);
        else params.delete("q");
        params.delete("page");
        startTransition(() => router.push(`?${params.toString()}`));
      }, 300);
    },
    [router, searchParams],
  );

  return (
    <div className={catalogStyles.filterBar}>
      <label className={`${catalogStyles.field} ${catalogStyles.fieldWide}`}>
        <span className={catalogStyles.srOnly}>Buscar reclamo</span>
        <input
          type="search"
          placeholder="Buscar por nombre, teléfono o documento..."
          value={value}
          onChange={(event) => handleChange(event.target.value)}
        />
      </label>
      <span role="status" aria-live="polite" className={catalogStyles.muted}>{isPending ? "Actualizando…" : ""}</span>
    </div>
  );
}
