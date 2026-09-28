"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { ProductFormFields } from "@/components/admin/product-form-fields";
import { SaveStatus, adminButtonClass } from "@/components/admin/admin-ui";
import type { Database } from "@/lib/supabase/database.types";
import {
  archiveProductAction,
  restoreProductAction,
  updateProductAction,
  type ActionState,
} from "../actions";
import formStyles from "@/components/admin/product-form-fields.module.css";
import styles from "@/components/admin/catalog-workspace.module.css";
import workspace from "@/components/admin/order-workspace.module.css";

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
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [dirty, setDirty] = useState(false);
  const router = useRouter();

  // After a confirmed save, refresh the server-rendered visibility summary.
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state, router]);

  // "Adjusting state during render" (React docs) rather than a useEffect:
  // synced synchronously in the render that first observes a new `state`
  // reference, so it never triggers a second, separate render pass.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") {
      setCurrent(state.data);
      setDirty(false);
    }
  }

  async function handleArchiveToggle() {
    setArchivePending(true);
    try {
      const result = current.archived_at
        ? await restoreProductAction(current.id, current.updated_at)
        : await archiveProductAction(current.id, current.updated_at);
      setArchiveState(result);
      if (result.status === "success") {
        setCurrent(result.data);
        setConfirmArchive(false);
        router.refresh();
      }
    } catch {
      setArchiveState({ status: "error", message: "No pudimos confirmar el cambio. Recarga la página antes de volver a intentarlo." });
    } finally {
      setArchivePending(false);
    }
  }

  const fieldErrors = state.status === "field_errors" ? state.errors : {};
  const isBusy = pending || archivePending;
  const saveState = pending
    ? "saving"
    : dirty
      ? "dirty"
      : state.status === "error" || state.status === "field_errors"
        ? "error"
        : state.status === "success"
          ? "saved"
          : "idle";

  return (
    <div className={styles.cards}>
      <form action={formAction} className={styles.card} aria-busy={isBusy} onChange={() => setDirty(true)}>
        {state.status === "error" ? (
          <p className={formStyles.error} role="alert">{state.message} Tus cambios no se guardaron.</p>
        ) : null}
        {state.status === "field_errors" ? (
          <p className={formStyles.error} role="alert">Revisa los campos marcados. Tus cambios no se guardaron.</p>
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

        {!disabled ? (
          <div className={styles.actionsRow}>
            <button type="submit" className={adminButtonClass("primary")} disabled={isBusy}>
              {pending ? "Guardando…" : "Guardar información"}
            </button>
            <SaveStatus
              state={saveState}
              message={saveState === "saved" ? "Información guardada" : saveState === "error" ? "No se guardó" : undefined}
            />
          </div>
        ) : null}
      </form>

      {!disabled ? (
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3 className={styles.cardTitle}>{current.archived_at ? "Producto archivado" : "Archivar producto"}</h3>
          </div>
          {archiveState.status === "error" ? <p className={formStyles.error} role="alert">{archiveState.message}</p> : null}
          {current.archived_at ? (
            <>
              <p className={styles.muted}>Restaurarlo lo devuelve a las listas activas. Revisa su publicación después de restaurarlo.</p>
              <div>
                <button type="button" className={adminButtonClass("secondary")} disabled={isBusy} onClick={handleArchiveToggle}>
                  {archivePending ? "Restaurando…" : "Restaurar producto"}
                </button>
              </div>
            </>
          ) : confirmArchive ? (
            <div className={workspace.dangerConfirm} role="group" aria-label="Confirmar archivo">
              <strong className={workspace.dangerTitle}>Archivar producto: ¿confirmas?</strong>
              <p className={workspace.consequence}>
                Deja de aparecer en la tienda y en las listas activas. Los pedidos existentes no cambian y podrás restaurarlo después.
              </p>
              <div className={workspace.dangerButtons}>
                <button type="button" className={adminButtonClass("danger")} disabled={isBusy} onClick={handleArchiveToggle}>
                  {archivePending ? "Archivando…" : "Sí, archivar producto"}
                </button>
                <button type="button" className={adminButtonClass("quiet")} disabled={isBusy} onClick={() => setConfirmArchive(false)}>
                  Volver sin cambios
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className={styles.muted}>Úsalo solo para productos que ya no vas a vender. Deja de aparecer en la tienda.</p>
              <div>
                <button type="button" className={adminButtonClass("danger")} disabled={isBusy} onClick={() => setConfirmArchive(true)}>
                  Archivar producto
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
