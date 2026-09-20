"use client";

import { useState } from "react";
import type { Database } from "@/lib/supabase/database.types";
import { VariantRow as VariantRowComponent } from "./variant-row";
import { NewVariantForm } from "./new-variant-form";
import styles from "../page.module.css";

type VariantRow = Database["public"]["Tables"]["product_variants"]["Row"];
type InventoryRow = Database["public"]["Tables"]["inventory"]["Row"];

export function VariantManager({
  productId,
  variants,
  disabled,
}: {
  productId: string;
  variants: (VariantRow & { inventory: InventoryRow | null })[];
  disabled: boolean;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const activeVariants = variants.filter((variant) => !variant.archived_at);
  const archivedVariants = variants.filter((variant) => variant.archived_at);

  return (
    <section className={styles.section} aria-labelledby="variants-title">
      <div className={styles.sectionTitle}>
        <h2 id="variants-title">Variantes ({activeVariants.length})</h2>
        {!disabled ? (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setShowAddForm((value) => !value)}
          >
            {showAddForm ? "Cancelar" : "+ Añadir variante"}
          </button>
        ) : null}
      </div>

      {showAddForm ? (
        <NewVariantForm productId={productId} onCreated={() => setShowAddForm(false)} />
      ) : null}

      {activeVariants.length === 0 ? (
        <p className={styles.notice}>Este producto todavía no tiene variantes.</p>
      ) : (
        <table className={styles.variantTable}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Tamaño (ml)</th>
              <th>Precio</th>
              <th>Inventario</th>
              <th>Publicación</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {activeVariants.map((variant) => (
              <VariantRowComponent
                key={variant.id}
                productId={productId}
                variant={variant}
                disabled={disabled}
              />
            ))}
          </tbody>
        </table>
      )}

      {archivedVariants.length > 0 ? (
        <details className={styles.notice}>
          <summary>{archivedVariants.length} variante{archivedVariants.length === 1 ? "" : "s"} archivada{archivedVariants.length === 1 ? "" : "s"}</summary>
          <table className={styles.variantTable}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Tamaño (ml)</th>
                <th>Precio</th>
                <th>Inventario</th>
                <th>Publicación</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {archivedVariants.map((variant) => (
                <VariantRowComponent
                  key={variant.id}
                  productId={productId}
                  variant={variant}
                  disabled={disabled}
                />
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </section>
  );
}
