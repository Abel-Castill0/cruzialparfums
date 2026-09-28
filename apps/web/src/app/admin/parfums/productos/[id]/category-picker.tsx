"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Database } from "@/lib/supabase/database.types";
import { SaveStatus, adminButtonClass } from "@/components/admin/admin-ui";
import { setProductCategoriesAction } from "../actions";
import formStyles from "@/components/admin/product-form-fields.module.css";
import catalogStyles from "@/components/admin/catalog-workspace.module.css";
import styles from "../page.module.css";

type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];

const KIND_LABELS: Record<string, { title: string; hint: string }> = {
  commercial_type: {
    title: "Tipo comercial",
    hint: "La tienda necesita un tipo comercial publicado (árabe, diseñador o nicho) para mostrar el producto.",
  },
  olfactory_family: { title: "Familia olfativa", hint: "Ayuda a tus clientes a filtrar y descubrir el producto." },
};

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

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
  const router = useRouter();
  const [saved, setSavedSet] = useState<Set<string>>(new Set(assignedCategoryIds));
  const [selected, setSelected] = useState<Set<string>>(new Set(assignedCategoryIds));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const dirty = !sameSet(selected, saved);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setJustSaved(false);
  }

  function handleSave() {
    setError(null);
    const snapshot = new Set(selected);
    startTransition(async () => {
      try {
        const result = await setProductCategoriesAction(productId, [...snapshot]);
        if (result.status === "error") setError(`${result.message} Las categorías no se guardaron.`);
        else {
          setSavedSet(snapshot);
          setJustSaved(true);
          // Refresh the server-rendered readiness summary; this section's
          // own state is kept because it is not re-initialized from props.
          router.refresh();
        }
      } catch {
        setError("No pudimos confirmar el guardado. Recarga la página antes de volver a intentarlo.");
      }
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

  const groups = new Map<string, CategoryRow[]>();
  for (const category of availableCategories) {
    const list = groups.get(category.kind) ?? [];
    list.push(category);
    groups.set(category.kind, list);
  }

  return (
    <section className={styles.section} aria-labelledby="categories-title">
      <div className={styles.sectionTitle}>
        <h2 id="categories-title">Categorías</h2>
      </div>

      {error ? <p className={formStyles.error} role="alert">{error}</p> : null}

      {[...groups.entries()].map(([kind, categories]) => {
        const meta = KIND_LABELS[kind] ?? { title: "Otras categorías", hint: "" };
        return (
          <fieldset key={kind} className={catalogStyles.card} disabled={disabled || isPending}>
            <legend className={catalogStyles.cardTitle}>{meta.title}</legend>
            {meta.hint ? <p className={catalogStyles.muted}>{meta.hint}</p> : null}
            <div className={styles.categoryList}>
              {categories.map((category) => (
                <label key={category.id} className={styles.categoryChip}>
                  <input
                    type="checkbox"
                    checked={selected.has(category.id)}
                    onChange={() => toggle(category.id)}
                  />
                  {category.name}
                  {category.publication_status !== "published" || category.archived_at ? " (no publicada)" : ""}
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}

      {!disabled ? (
        <div className={catalogStyles.actionsRow}>
          <button type="button" className={adminButtonClass("primary")} onClick={handleSave} disabled={isPending || !dirty}>
            {isPending ? "Guardando…" : "Guardar categorías"}
          </button>
          <SaveStatus
            state={isPending ? "saving" : dirty ? "dirty" : justSaved ? "saved" : "idle"}
            message={justSaved && !dirty && !isPending ? "Categorías guardadas" : undefined}
          />
        </div>
      ) : null}
    </section>
  );
}
