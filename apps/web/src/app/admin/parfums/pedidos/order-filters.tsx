"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import baseStyles from "../productos/page.module.css";

export function OrderFilters({ initial }: { initial: { search: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initial.search);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function apply(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "") params.delete("q");
    else params.set("q", value);
    params.delete("page"); // any filter change resets pagination
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => apply(value), 350);
  }

  return (
    <div className={baseStyles.filters} role="search" aria-label="Buscar pedidos">
      <label className={baseStyles.searchField}>
        <span className={baseStyles.srOnly}>Buscar por número de pedido, nombre o teléfono</span>
        <input
          type="search"
          value={search}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Buscar por número de pedido, nombre o teléfono…"
        />
      </label>

      <span className={baseStyles.filtersStatus} aria-live="polite">
        {isPending ? "Actualizando…" : ""}
      </span>
    </div>
  );
}
