"use client";

import { useState, useTransition } from "react";
import type { Database } from "@/lib/supabase/database.types";
import { setProductCategoriesAction } from "../actions";
import formStyles from "@/components/admin/product-form-fields.module.css";
import styles from "../page.module.css";

type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];

export function CategoryPicker({
  productId,
  availableCategories,
  assignedCategoryIds,
  disabled,
}: {
  productId: string;
  availableCategories: CategoryRow[];
  assignedCategoryIds: string[];
  disabled: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(assignedCategoryIds));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSaved(false);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await setProductCategoriesAction(productId, [...selected]);
      if (result.status === "error") setError(result.message);
      else setSaved(true);
    });
  }

  if (availableCategories.length === 0) {
    return (
      <section className={styles.section} aria-labelledby="categories-title">
        <h2 id="categories-title" className={formStyles.legend}>Categorías</h2>
        <p className={styles.notice}>No hay categorías creadas todavía para Parfums.</p>
      </section>
    );
  }

  return (
    <section className={styles.section} aria-labelledby="categories-title">
      <div className={styles.sectionTitle}>
        <h2 id="categories-title">Categorías</h2>
      </div>

      {error ? <p className={formStyles.error} role="alert">{error}</p> : null}
      {saved ? <p className={styles.savedNote} role="status">Guardado.</p> : null}

      <div className={styles.categoryList} role="group" aria-label="Categorías asignadas">
        {availableCategories.map((category) => (
          <label key={category.id} className={styles.categoryChip}>
            <input
              type="checkbox"
              checked={selected.has(category.id)}
              disabled={disabled || isPending}
              onChange={() => toggle(category.id)}
            />
            {category.name}
          </label>
        ))}
      </div>

      {!disabled ? (
        <div className={`${styles.formActions} ${styles.spacingTop}`}>
          <button type="button" className={styles.primaryButton} onClick={handleSave} disabled={isPending}>
            {isPending ? "Guardando…" : "Guardar categorías"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
