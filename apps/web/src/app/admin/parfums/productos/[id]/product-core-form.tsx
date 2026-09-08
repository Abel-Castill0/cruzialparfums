"use client";

import { useActionState, useState } from "react";
import { ProductFormFields } from "@/components/admin/product-form-fields";
import type { Database } from "@/lib/supabase/database.types";
import {
  archiveProductAction,
  restoreProductAction,
  updateProductAction,
  type ActionState,
} from "../actions";
import formStyles from "@/components/admin/product-form-fields.module.css";
import styles from "../page.module.css";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];

const initialState: ActionState<ProductRow> = { status: "idle" };

export function ProductCoreForm({
  product,
  disabled,
}: {
  product: ProductRow;
  disabled: boolean;
}) {
  // Tracked client-side so a successful save updates the optimistic-
  // concurrency token without a full page reload — otherwise the *next*
  // save would look like a conflict against the now-stale value the page
  // was first rendered with.
  const [current, setCurrent] = useState(product);
  const boundUpdate = updateProductAction.bind(null, current.id, current.updated_at);
  const [state, formAction, pending] = useActionState(boundUpdate, initialState);
  const [archiveState, setArchiveState] = useState<ActionState<ProductRow>>({ status: "idle" });
  const [archivePending, setArchivePending] = useState(false);

  // "Adjusting state during render" (React docs) rather than a useEffect:
  // synced synchronously in the render that first observes a new `state`
  // reference, so it never triggers a second, separate render pass.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") setCurrent(state.data);
  }

  async function handleArchiveToggle() {
    setArchivePending(true);
    const result = current.archived_at
      ? await restoreProductAction(current.id, current.updated_at)
      : await archiveProductAction(current.id, current.updated_at);
    setArchiveState(result);
    if (result.status === "success") setCurrent(result.data);
    setArchivePending(false);
  }

  const fieldErrors = state.status === "field_errors" ? state.errors : {};
  const isBusy = pending || archivePending;

  return (
    <form action={formAction} className={styles.section} aria-busy={isBusy}>
      {state.status === "error" ? (
        <p className={formStyles.error} role="alert">{state.message}</p>
      ) : null}
      {archiveState.status === "error" ? (
        <p className={formStyles.error} role="alert">{archiveState.message}</p>
      ) : null}
      {state.status === "success" ? (
        <p className={styles.savedNote} role="status">Guardado.</p>
      ) : null}

      <ProductFormFields
        defaults={{
          slug: current.slug,
          name: current.name,
          brand: current.brand ?? "",
          shortDescription: current.short_description ?? "",
          description: current.description ?? "",
          gender: current.gender ?? "",
          concentration: current.concentration ?? "",
          salesMode: current.sales_mode,
          productionStatus: current.production_status,
          publicationStatus: current.publication_status,
          isFeatured: current.is_featured,
          featuredRank: current.featured_rank?.toString() ?? "",
          featuredFrom: current.featured_from ?? "",
          featuredUntil: current.featured_until ?? "",
        }}
        errors={fieldErrors}
        disabled={disabled || isBusy}
      />

      <div className={styles.formActions}>
        <button type="submit" className={styles.primaryButton} disabled={disabled || isBusy}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
        <button
          type="button"
          className={styles.dangerButton}
          disabled={disabled || isBusy}
          onClick={handleArchiveToggle}
        >
          {current.archived_at
            ? (archivePending ? "Restaurando…" : "Restaurar producto")
            : (archivePending ? "Archivando…" : "Archivar producto")}
        </button>
      </div>
    </form>
  );
}
