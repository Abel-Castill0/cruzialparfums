"use client";

import { useState } from "react";
import type {
  ComboCompositionItem,
  ComboDetail,
  ComboProductVariant,
  ComboRow,
  EligibleVariant,
} from "@/domains/admin-parfums/combos-repository";
import { computeComboReadiness } from "@/domains/admin-parfums/combo-schema";
import {
  comboNextAction,
  comboPresentationLabel,
  comboVerificationLabel,
  comboVerificationTone,
  comboVisibility,
} from "@/domains/admin-parfums/combo-presentation";
import { PRODUCT_STATUS_LABELS, type PublicationStatus } from "@/domains/admin-parfums/product-schema";
import {
  ActionLink,
  AdminPage,
  AdminPageHeader,
  AdminSection,
  BackLink,
  Disclosure,
  FactList,
  NextStepCard,
  StatusBadge,
} from "@/components/admin/admin-ui";
import { ComboArchiveControl, ComboVerificationEditor } from "./combo-editor";
import { CompositionManager, type SavedCompositionSummary } from "./composition-manager";
import styles from "@/components/admin/catalog-workspace.module.css";
import comboStyles from "../combos.module.css";

function summarize(items: readonly Pick<ComboCompositionItem, "variantArchived" | "productArchived">[]): SavedCompositionSummary {
  return {
    itemCount: items.length,
    hasArchivedItem: items.some((item) => item.variantArchived || item.productArchived),
  };
}

/**
 * Owns the combo row as the single client-side source of truth for its
 * `updated_at` concurrency token. The verification editor, the archive
 * control and CompositionManager all mutate the SAME `combos` row — unlike
 * products, where the core form/variant rows/inventory rows are genuinely
 * independent tables with independent `updated_at` columns. If each child
 * tracked its own copy of `updated_at` after its own successful save, saving
 * one would silently leave the others holding a stale token, and their next
 * save would incorrectly report "modified by another session" even within
 * the same browser tab. Lifting the combo row here and threading it through
 * every child as a controlled value keeps a single, always-current token.
 *
 * The customer-visibility summary is recomputed here from that same row plus
 * the last SAVED composition (never unsaved local edits), always through
 * computeComboReadiness().
 */
export function ComboWorkspace({
  combo: initialCombo,
  product,
  comboProductVariants,
  items,
  eligibleVariants,
  eligibleVariantsFailed,
  canWrite,
}: {
  combo: ComboRow;
  product: ComboDetail["product"];
  comboProductVariants: ComboProductVariant[];
  items: ComboCompositionItem[];
  eligibleVariants: EligibleVariant[];
  eligibleVariantsFailed: boolean;
  canWrite: boolean;
}) {
  const [combo, setCombo] = useState(initialCombo);
  const [saved, setSaved] = useState<SavedCompositionSummary>(() => summarize(items));
  const [compositionDirty, setCompositionDirty] = useState(false);
  const isArchived = combo.archived_at !== null;
  // Open "Opciones avanzadas" for a combo that LOADED archived; never bind it
  // to live state, or archiving/restoring would collapse it and hide the result.
  const [openAdvanced] = useState(initialCombo.archived_at !== null);

  const blockers = computeComboReadiness({
    productPublicationStatus: product.publication_status,
    productArchived: product.archived_at !== null,
    comboArchived: isArchived,
    compositionVerificationStatus: combo.composition_verification_status,
    itemCount: saved.itemCount,
    hasArchivedItem: saved.hasArchivedItem,
  });
  const visibility = comboVisibility(blockers);
  const next = comboNextAction(blockers);
  const productHref = `/admin/parfums/productos/${product.id}`;
  const publication = product.publication_status as PublicationStatus;
  const productArchived = product.archived_at !== null;

  return (
    <AdminPage width="wide">
      <div>
        <BackLink href="/admin/parfums/combos">Combos</BackLink>
        <AdminPageHeader
          eyebrow="Cruzial Parfums · Combo"
          title={product.name}
          description={product.brand ?? "Sin marca"}
          meta={canWrite ? undefined : "Acceso de solo lectura: puedes ver este combo y su composición, pero no guardar cambios."}
          actions={
            <div className={styles.headerBadges}>
              <StatusBadge tone={visibility.tone}>{visibility.label}</StatusBadge>
              <StatusBadge tone={comboVerificationTone(combo.composition_verification_status)}>
                {comboVerificationLabel(combo.composition_verification_status, "short")}
              </StatusBadge>
            </div>
          }
        />
      </div>

      <section className={styles.summary} aria-labelledby="visibility-title">
        <div className={styles.summaryMain}>
          <h2 id="visibility-title" className={styles.eyebrow}>Qué ven tus clientes</h2>
          <p className={styles.headline}>{visibility.headline}</p>
          {visibility.visible ? (
            <>
              <p className={styles.consequence}>
                El producto está publicado, la composición está verificada y todos sus productos siguen activos.
              </p>
              <p className={styles.muted}>
                La tienda también necesita los datos del producto completos (por ejemplo, sus presentaciones publicadas).
                Si no lo ves, revisa el producto.
              </p>
              <ActionLink href="/parfums/combos" variant="quiet" external>Ver combos como cliente</ActionLink>
            </>
          ) : (
            <>
              <p className={styles.consequence}>Por qué:</p>
              <ul className={comboStyles.reasons} aria-label="Motivos por los que no aparece">
                {visibility.reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </>
          )}
          {compositionDirty ? (
            <p className={styles.muted} role="status">Hay cambios de composición sin guardar; este resumen usa la composición guardada.</p>
          ) : null}
        </div>
        <div className={styles.summaryNext}>
          {next ? (
            <NextStepCard title={next.title} tone={next.target.kind === "section" && next.target.anchor === "#avanzado" ? "neutral" : "attention"}>
              <p>{next.detail}</p>
              <ActionLink href={next.target.kind === "product" ? productHref : next.target.anchor} variant="primary">
                {canWrite ? next.actionLabel : next.target.kind === "product" ? "Ver producto" : "Ver detalle"}
              </ActionLink>
            </NextStepCard>
          ) : (
            <NextStepCard title="Nada pendiente" tone="healthy">
              <p>El combo tiene todo lo que la tienda necesita para mostrarlo.</p>
            </NextStepCard>
          )}
        </div>
      </section>

      <AdminSection
        id="producto"
        title="Producto del combo"
        description="Nombre, precio, fotos y publicación pertenecen al producto del combo. Se editan en el producto, no aquí."
      >
        <div className={styles.card}>
          <FactList
            items={[
              { term: "Producto", value: product.name },
              { term: "Marca", value: product.brand ?? "Sin marca" },
              {
                term: "Publicación del producto",
                value: productArchived ? "Archivado" : PRODUCT_STATUS_LABELS[publication] ?? "Estado desconocido",
              },
              {
                term: "Presentaciones del combo",
                value: comboProductVariants.length === 0
                  ? "Sin presentaciones"
                  : comboProductVariants.map((presentation) => comboPresentationLabel(presentation)).join(", "),
              },
            ]}
          />
          <div className={comboStyles.split}>
            <div>
              <p className={styles.eyebrow}>Se edita en el producto</p>
              <p className={styles.muted}>Nombre, marca, identificador en la tienda, presentaciones y precios, fotos y publicación.</p>
            </div>
            <div>
              <p className={styles.eyebrow}>Se edita aquí</p>
              <p className={styles.muted}>Qué incluye cada presentación, si esa composición está verificada y el archivo del combo.</p>
            </div>
          </div>
          <div className={styles.actionsRow}>
            <ActionLink href={productHref}>{canWrite ? "Editar producto" : "Ver producto"}</ActionLink>
          </div>
        </div>
      </AdminSection>

      <div id="composicion" className={styles.anchor}>
        <CompositionManager
          comboId={combo.id}
          comboUpdatedAt={combo.updated_at}
          verificationStatus={combo.composition_verification_status}
          onComboChange={setCombo}
          onSaved={setSaved}
          onDirtyChange={setCompositionDirty}
          comboProductVariants={comboProductVariants}
          items={items}
          eligibleVariants={eligibleVariants}
          eligibleVariantsFailed={eligibleVariantsFailed}
          productHref={productHref}
          canWrite={canWrite}
          archived={isArchived}
        />
      </div>

      <div id="verificacion" className={styles.anchor}>
        <ComboVerificationEditor
          combo={combo}
          onChange={setCombo}
          canWrite={canWrite}
          compositionDirty={compositionDirty}
        />
      </div>

      <div id="avanzado" className={styles.anchor}>
        <Disclosure
          summary="Opciones avanzadas"
          hint={isArchived ? "El combo está archivado" : "Archivar combo y detalle técnico"}
          defaultOpen={openAdvanced}
        >
          <div className={styles.cards}>
            <ComboArchiveControl combo={combo} onChange={setCombo} canWrite={canWrite} />
            <FactList
              items={[
                { term: "Identificador del producto en la tienda (slug)", value: product.slug },
                { term: "Combo actualizado", value: new Date(combo.updated_at).toLocaleString("es-PE", { timeZone: "America/Lima" }) },
              ]}
            />
          </div>
        </Disclosure>
      </div>
    </AdminPage>
  );
}
