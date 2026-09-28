"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { AvailabilityStatus, ProductionStatus, PublicationStatus } from "@/domains/admin-parfums/product-schema";
import styles from "@/components/admin/catalog-workspace.module.css";

/** Search stays visible; the full set of existing URL filters lives under
 * "Más filtros" so deep links (e.g. ?availability=out_of_stock) keep working
 * and are always visible and clearable. */
export function ProductFilters({
  initial,
}: {
  initial: {
    search: string;
    publicationStatus: PublicationStatus | undefined;
    productionStatus: ProductionStatus | undefined;
    availabilityStatus: AvailabilityStatus | undefined;
    featuredOnly: boolean;
    includeArchived: boolean;
  };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initial.search);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advancedActive = Boolean(
    initial.productionStatus || initial.featuredOnly || initial.includeArchived || initial.publicationStatus || initial.availabilityStatus,
  );

  function apply(next: Partial<Record<"q" | "publication" | "production" | "availability" | "featured" | "archived", string>>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === "") params.delete(key);
      else params.set(key, value);
    }
    params.delete("page"); // any filter change resets pagination
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => apply({ q: value }), 350);
  }

  return (
    <div className={styles.toolbar} role="search" aria-label="Filtrar productos">
      <div className={styles.filterBar}>
        <label className={`${styles.field} ${styles.fieldWide}`}>
          <span className={styles.srOnly}>Buscar por nombre, marca o identificador</span>
          <input
            type="search"
            value={search}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Buscar por nombre o marca…"
          />
        </label>
        <span className={styles.muted} aria-live="polite">{isPending ? "Actualizando…" : ""}</span>
      </div>

      <details className={styles.advanced} open={advancedActive || undefined}>
        <summary>Más filtros{advancedActive ? " (activos)" : ""}</summary>
        <div className={`${styles.advancedBody} ${styles.filterBar}`}>
          <label className={styles.field}>
            <span>Publicación</span>
            <select
              value={initial.publicationStatus ?? ""}
              onChange={(event) => apply({ publication: event.target.value })}
            >
              <option value="">Todas</option>
              <option value="draft">Borrador</option>
              <option value="published">Publicado</option>
              <option value="archived">Archivado</option>
            </select>
          </label>

          <label className={styles.field}>
            <span>Disponibilidad</span>
            <select
              value={initial.availabilityStatus ?? ""}
              onChange={(event) => apply({ availability: event.target.value })}
            >
              <option value="">Todas</option>
              <option value="available">Disponible</option>
              <option value="out_of_stock">Agotado</option>
            </select>
          </label>

          <label className={styles.field}>
            <span>Producción</span>
            <select
              value={initial.productionStatus ?? ""}
              onChange={(event) => apply({ production: event.target.value })}
            >
              <option value="">Todas</option>
              <option value="active">Activo</option>
              <option value="discontinued">Descontinuado</option>
            </select>
          </label>

          <label className={styles.check}>
            <input
              type="checkbox"
              checked={initial.featuredOnly}
              onChange={(event) => apply(event.target.checked ? { featured: "1" } : { featured: "" })}
            />
            Solo destacados
          </label>

          <label className={styles.check}>
            <input
              type="checkbox"
              checked={initial.includeArchived}
              onChange={(event) => apply(event.target.checked ? { archived: "1" } : { archived: "" })}
            />
            Incluir archivados
          </label>
        </div>
      </details>
    </div>
  );
}
