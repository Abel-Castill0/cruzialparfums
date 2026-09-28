/**
 * Owner-facing presentation of wholesale state (Phase B2B).
 *
 * Presentation only. Thresholds, discounts and wholesale prices always come
 * from `wholesale_policies` / `admin_parfums_wholesale_catalog`; nothing
 * here computes money or supplies a default business value. A missing value
 * is reported as missing, never replaced.
 */

import type { AdminTone } from "@/components/admin/admin-ui";
import {
  WHOLESALE_COMMERCIAL_TYPE_LABELS,
  isWholesaleCommercialType,
  type WholesaleCommercialType,
} from "./wholesale-schema";

export const WHOLESALE_ELIGIBILITY_STATUSES = [
  "eligible",
  "missing_classification",
  "ambiguous_classification",
  "unsupported_classification",
  "policy_disabled",
] as const;

export type WholesaleEligibility = (typeof WHOLESALE_ELIGIBILITY_STATUSES)[number];
export type WholesaleAttentionStatus = Exclude<WholesaleEligibility, "eligible">;

export const WHOLESALE_ATTENTION_STATUSES: readonly WholesaleAttentionStatus[] = [
  "missing_classification",
  "ambiguous_classification",
  "unsupported_classification",
  "policy_disabled",
];

export function isWholesaleEligibility(value: unknown): value is WholesaleEligibility {
  return typeof value === "string" && (WHOLESALE_ELIGIBILITY_STATUSES as readonly string[]).includes(value);
}

export const WHOLESALE_ELIGIBILITY_LABELS: Record<WholesaleEligibility, string> = {
  eligible: "Listo para Mayorista",
  missing_classification: "Falta tipo comercial",
  ambiguous_classification: "Revisa la clasificación",
  unsupported_classification: "Tipo comercial no compatible",
  policy_disabled: "Política desactivada",
};

/** What is wrong and where it is fixed — mirrors the view's CASE order. */
export const WHOLESALE_ELIGIBILITY_HINTS: Record<WholesaleEligibility, string> = {
  eligible: "Recibe el descuento de su tipo cuando el pedido llega al mínimo.",
  missing_classification: "El producto no tiene tipo comercial (Árabe, Diseñador o Nicho). Asígnalo en las categorías del producto.",
  ambiguous_classification: "El producto tiene más de un tipo comercial. Deja solo uno en las categorías del producto.",
  unsupported_classification: "Su tipo comercial no tiene una regla mayorista configurada.",
  policy_disabled: "La regla de su tipo comercial está desactivada. Actívala arriba si debe venderse por mayor.",
};

export function wholesaleEligibilityTone(status: WholesaleEligibility): AdminTone {
  return status === "eligible" ? "healthy" : "attention";
}

/** Task views over EXISTING statuses. "attention" is only a presentation
 * group: every non-eligible status the view already returns. */
export type WholesaleView = "all" | "eligible" | "attention";

export const WHOLESALE_ATTENTION_PARAM = "attention";

export type WholesaleEligibilityFilter =
  | { kind: "none" }
  | { kind: "status"; status: WholesaleEligibility }
  | { kind: "attention" };

export function parseWholesaleEligibilityParam(value: unknown): WholesaleEligibilityFilter {
  if (value === WHOLESALE_ATTENTION_PARAM) return { kind: "attention" };
  if (isWholesaleEligibility(value)) return { kind: "status", status: value };
  return { kind: "none" };
}

export function currentWholesaleView(filter: WholesaleEligibilityFilter): WholesaleView | null {
  if (filter.kind === "none") return "all";
  if (filter.kind === "attention") return "attention";
  return filter.status === "eligible" ? "eligible" : null;
}

export type PolicyLike = {
  commercial_type: string | null;
  min_quantity: number | null;
  discount_amount: number | null;
  currency: string;
  is_active: boolean;
};

export type PolicySummary =
  | {
      complete: true;
      label: string;
      active: boolean;
      minQuantity: number;
      discountText: string;
    }
  | {
      complete: false;
      label: string;
      active: boolean;
      missing: string[];
    };

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-PE", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function commercialTypeLabel(value: string | null): string | null {
  return isWholesaleCommercialType(value) ? WHOLESALE_COMMERCIAL_TYPE_LABELS[value] : null;
}

/** Reports what the stored policy says — or which part is missing. Never
 * substitutes a historical threshold or discount. */
export function summarizePolicy(policy: PolicyLike, fallbackType: WholesaleCommercialType): PolicySummary {
  const label = commercialTypeLabel(policy.commercial_type) ?? WHOLESALE_COMMERCIAL_TYPE_LABELS[fallbackType];
  const missing: string[] = [];
  const minQuantity = policy.min_quantity;
  const discount = policy.discount_amount;
  if (minQuantity === null || !Number.isSafeInteger(minQuantity) || minQuantity < 1) missing.push("pedido mínimo");
  if (discount === null || !Number.isFinite(discount) || discount <= 0) missing.push("descuento por frasco");
  if (missing.length > 0 || minQuantity === null || discount === null) {
    return { complete: false, label, active: policy.is_active, missing };
  }
  return {
    complete: true,
    label,
    active: policy.is_active,
    minQuantity,
    discountText: formatMoney(discount, policy.currency),
  };
}

export function policyMeaning(summary: PolicySummary): string {
  if (!summary.complete) {
    return `No podemos explicar esta regla: falta ${summary.missing.join(" y ")}. Ningún frasco ${summary.label} debería venderse por mayor hasta corregirla.`;
  }
  if (!summary.active) {
    return `Desactivada: los frascos ${summary.label} no reciben precio mayorista y la tienda no muestra esta regla.`;
  }
  return `Cuando un pedido suma al menos ${summary.minQuantity} frascos ${summary.label}, cada frasco ${summary.label} baja ${summary.discountText} de su precio normal.`;
}

export const AVAILABILITY_LABELS: Record<string, string> = {
  available: "Disponible",
  out_of_stock: "Agotado",
};

/** Necessary storefront conditions only (published product + variant, not
 * archived). Passing them never proves the bottle is shown; failing any of
 * them proves it is not. */
export function storefrontExclusionReason(row: {
  product_publication_status: string;
  variant_publication_status: string;
  product_archived_at: string | null;
  variant_archived_at: string | null;
}): string | null {
  if (row.product_archived_at !== null) return "producto archivado";
  if (row.variant_archived_at !== null) return "frasco archivado";
  if (row.product_publication_status !== "published") return "producto sin publicar";
  if (row.variant_publication_status !== "published") return "frasco sin publicar";
  return null;
}
