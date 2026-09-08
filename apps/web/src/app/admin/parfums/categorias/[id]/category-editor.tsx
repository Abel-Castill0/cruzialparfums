"use client";

import { useActionState, useState } from "react";
import { CategoryFormFields } from "@/components/admin/category-form-fields";
import type {
  CategoryDetail,
  CategoryParentOption,
} from "@/domains/admin-parfums/categories-repository";
import type { CategoryKind } from "@/domains/admin-parfums/category-schema";
import {
  archiveCategoryAction,
  restoreCategoryAction,
  updateCategoryAction,
  type CategoryActionState,
} from "../actions";
import formStyles from "@/components/admin/product-form-fields.module.css";
import styles from "../../productos/page.module.css";

const initialState: CategoryActionState = { status: "idle" };

export function CategoryEditor({
  category,
  parentOptions,
  disabled,
}: {
  category: CategoryDetail;
  parentOptions: CategoryParentOption[];
  disabled: boolean;
}) {
  const [current, setCurrent] = useState(category);
  const boundUpdate = updateCategoryAction.bind(null, current.id, current.updated_at);
  const [state, formAction, pending] = useActionState(boundUpdate, initialState);
  const [archiveState, setArchiveState] = useState<CategoryActionState>({ status: "idle" });
  const [archivePending, setArchivePending] = useState(false);
  const [handledState, setHandledState] = useState(state);

  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") setCurrent({ ...current, ...state.data });
  }

  async function toggleArchive() {
    setArchivePending(true);
    const result = current.archived_at
      ? await restoreCategoryAction(current.id, current.updated_at)
      : await archiveCategoryAction(current.id, current.updated_at);
    setArchiveState(result);
    if (result.status === "success") setCurrent({ ...current, ...result.data });
    setArchivePending(false);
  }

  const errors = state.status === "field_errors" ? state.errors : {};
  const isBusy = pending || archivePending;
  const fieldsDisabled = disabled || isBusy || current.archived_at !== null;

  return (
    <form action={formAction} className={styles.section} aria-busy={isBusy}>
      {!disabled && current.archived_at ? (
        <p className={styles.notice} role="status">Esta categoría está archivada. Restáurala antes de editar sus datos.</p>
      ) : null}
      {state.status === "error" ? <p className={formStyles.error} role="alert">{state.message}</p> : null}
      {archiveState.status === "error" ? <p className={formStyles.error} role="alert">{archiveState.message}</p> : null}
      {state.status === "success" ? <p className={styles.savedNote} role="status">Guardado.</p> : null}
      {archiveState.status === "success" ? (
        <p className={styles.savedNote} role="status">{archiveState.data.archived_at ? "Categoría archivada." : "Categoría restaurada como borrador."}</p>
      ) : null}

      <CategoryFormFields
        key={`${current.id}-${current.archived_at ?? "active"}`}
        defaults={{
          kind: current.kind as CategoryKind,
          slug: current.slug,
          name: current.name,
          description: current.description ?? "",
          parentId: current.parent_id ?? "",
          publicationStatus: current.publication_status === "published" ? "published" : "draft",
          sortOrder: String(current.sort_order),
        }}
        parentOptions={parentOptions}
        errors={errors}
        disabled={fieldsDisabled}
      />

      <p className={styles.notice}>
        Relaciones actuales: {current.product_count} producto{current.product_count === 1 ? "" : "s"} · {current.active_child_count} categoría{current.active_child_count === 1 ? " hija activa" : "s hijas activas"}.
      </p>

      <div className={styles.formActions}>
        <button type="submit" className={styles.primaryButton} disabled={fieldsDisabled}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
        <button type="button" className={styles.dangerButton} disabled={disabled || isBusy} onClick={toggleArchive}>
          {current.archived_at
            ? (archivePending ? "Restaurando…" : "Restaurar categoría")
            : (archivePending ? "Archivando…" : "Archivar categoría")}
        </button>
      </div>
    </form>
  );
}
