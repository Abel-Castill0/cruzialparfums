/**
 * Owner-facing presentation of combo state (Phase B2B).
 *
 * Presentation only: every verdict here is derived from
 * computeComboReadiness() and the persisted verification status. Nothing
 * in this module decides what the storefront shows or what the database
 * accepts — it only explains it in plain language.
 */

import type { AdminTone } from "@/components/admin/admin-ui";
import type { ComboReadinessBlocker, PersistedCompositionVerificationStatus } from "./combo-schema";
import { isVerificationStatus } from "./combo-schema";

/** Plain-language verification labels. The stored enum never changes. */
export const COMBO_VERIFICATION_OWNER_LABELS: Record<PersistedCompositionVerificationStatus, string> = {
  official_pdf: "Composición verificada por fuente oficial",
  client_confirmed: "Composición confirmada por cliente",
  pending_reconfirmation: "Necesita reconfirmación",
  unknown: "Sin verificar",
};

/** Short form for compact list rows and filters. */
export const COMBO_VERIFICATION_SHORT_LABELS: Record<PersistedCompositionVerificationStatus, string> = {
  official_pdf: "Verificada · fuente oficial",
  client_confirmed: "Confirmada por cliente",
  pending_reconfirmation: "Necesita reconfirmación",
  unknown: "Sin verificar",
};

export const COMBO_VERIFICATION_EXPLANATIONS: Record<PersistedCompositionVerificationStatus, string> = {
  official_pdf: "Este estado proviene de una fuente autorizada y no se cambia manualmente.",
  client_confirmed: "El cliente confirmó qué incluye este combo. Cuenta como composición verificada.",
  pending_reconfirmation: "Falta que el cliente reconfirme qué incluye este combo. Mientras tanto no puede aparecer en la tienda.",
  unknown: "Nadie ha verificado qué incluye este combo. Mientras tanto no puede aparecer en la tienda.",
};

export function comboVerificationTone(status: string): AdminTone {
  if (status === "official_pdf" || status === "client_confirmed") return "healthy";
  return "attention";
}

export function comboVerificationLabel(status: string, form: "owner" | "short" = "owner"): string {
  if (!isVerificationStatus(status)) return "Estado de verificación desconocido";
  return form === "short" ? COMBO_VERIFICATION_SHORT_LABELS[status] : COMBO_VERIFICATION_OWNER_LABELS[status];
}

/** Owner wording for each authoritative blocker, in the same order
 * computeComboReadiness() reports them. */
export const COMBO_BLOCKER_OWNER_LABELS: Record<ComboReadinessBlocker, string> = {
  combo_archived: "El combo está archivado.",
  product_archived: "El producto del combo está archivado.",
  product_unpublished: "El producto del combo no está publicado.",
  composition_unconfirmed: "La composición no está verificada (por fuente oficial o por el cliente).",
  no_items: "El combo todavía no tiene productos en su composición.",
  item_archived: "Uno o más productos de la composición están archivados.",
};

export type ComboVisibility = {
  visible: boolean;
  label: string;
  tone: AdminTone;
  headline: string;
  reasons: string[];
};

export function comboVisibility(blockers: readonly ComboReadinessBlocker[]): ComboVisibility {
  if (blockers.length === 0) {
    return {
      visible: true,
      label: "Puede aparecer en la tienda",
      tone: "healthy",
      headline: "Este combo cumple las condiciones para aparecer en el catálogo.",
      reasons: [],
    };
  }
  return {
    visible: false,
    label: blockers.includes("combo_archived") ? "Archivado" : "No visible",
    tone: blockers.includes("combo_archived") ? "neutral" : "attention",
    headline: "Este combo todavía no puede aparecer en la tienda.",
    reasons: blockers.map((blocker) => COMBO_BLOCKER_OWNER_LABELS[blocker]),
  };
}

export type ComboSectionAnchor = "#composicion" | "#verificacion" | "#avanzado";

export type ComboNextAction = {
  title: string;
  detail: string;
  /** Where the fix happens: a section of this workspace or the product editor. */
  target: { kind: "section"; anchor: ComboSectionAnchor } | { kind: "product" };
  actionLabel: string;
};

/** One next step, from the FIRST authoritative blocker only. */
export function comboNextAction(blockers: readonly ComboReadinessBlocker[]): ComboNextAction | null {
  const first = blockers[0];
  if (first === undefined) return null;
  switch (first) {
    case "combo_archived":
      return {
        title: "Restaura el combo",
        detail: "Un combo archivado no se muestra. Restáuralo en “Opciones avanzadas” si debe volver a venderse.",
        target: { kind: "section", anchor: "#avanzado" },
        actionLabel: "Ir a opciones avanzadas",
      };
    case "product_archived":
      return {
        title: "Restaura el producto del combo",
        detail: "El producto que representa este combo está archivado. Se restaura desde el editor del producto.",
        target: { kind: "product" },
        actionLabel: "Abrir producto",
      };
    case "product_unpublished":
      return {
        title: "Publica el producto del combo",
        detail: "Nombre, precio, fotos y publicación pertenecen al producto. Publícalo desde el editor del producto.",
        target: { kind: "product" },
        actionLabel: "Abrir producto",
      };
    case "composition_unconfirmed":
      return {
        title: "Verifica la composición",
        detail: "Cuando el cliente confirme qué incluye el combo, márcalo como confirmado en “Verificación”.",
        target: { kind: "section", anchor: "#verificacion" },
        actionLabel: "Ir a verificación",
      };
    case "no_items":
      return {
        title: "Agrega lo que incluye el combo",
        detail: "Elige los perfumes y cantidades de cada presentación del combo y guarda la composición.",
        target: { kind: "section", anchor: "#composicion" },
        actionLabel: "Ir a composición",
      };
    case "item_archived":
      return {
        title: "Reemplaza los productos archivados",
        detail: "Quita de la composición los productos o presentaciones archivados y guarda los cambios.",
        target: { kind: "section", anchor: "#composicion" },
        actionLabel: "Ir a composición",
      };
  }
}

/** "3 ml" / "Set 5 ml · 5 ml" — never an internal id. */
export function comboPresentationLabel(presentation: { label: string; sizeMl: number | null }): string {
  if (presentation.sizeMl === null) return presentation.label;
  const size = `${presentation.sizeMl} ml`;
  return presentation.label.toLowerCase().includes(size) ? presentation.label : `${presentation.label} · ${size}`;
}
