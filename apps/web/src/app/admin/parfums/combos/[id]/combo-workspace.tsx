"use client";

import { useState } from "react";
import type { ComboCompositionItem, ComboRow, EligibleVariant } from "@/domains/admin-parfums/combos-repository";
import { ComboEditor } from "./combo-editor";
import { CompositionManager } from "./composition-manager";

/**
 * Owns the combo row as the single client-side source of truth for its
 * `updated_at` concurrency token. ComboEditor (verification status,
 * archive/restore) and CompositionManager (composition replace) both mutate
 * the SAME `combos` row — unlike products, where the core form/variant rows/
 * inventory rows are genuinely independent tables with independent
 * `updated_at` columns. If each child tracked its own copy of `updated_at`
 * after its own successful save, saving one would silently leave the other
 * holding a stale token, and its next save would incorrectly report "modified
 * by another session" even within the same browser tab. Lifting the combo
 * row here and threading it through both children as a controlled value
 * keeps a single, always-current token.
 */
export function ComboWorkspace({
  combo: initialCombo,
  items,
  eligibleVariants,
  disabled,
}: {
  combo: ComboRow;
  items: ComboCompositionItem[];
  eligibleVariants: EligibleVariant[];
  disabled: boolean;
}) {
  const [combo, setCombo] = useState(initialCombo);
  const isArchived = combo.archived_at !== null;

  return (
    <>
      <ComboEditor combo={combo} onChange={setCombo} disabled={disabled} />

      <CompositionManager
        comboId={combo.id}
        comboUpdatedAt={combo.updated_at}
        onUpdatedAtChange={(updatedAt) => setCombo((previous) => ({ ...previous, updated_at: updatedAt }))}
        items={items}
        eligibleVariants={eligibleVariants}
        disabled={disabled || isArchived}
      />
    </>
  );
}
