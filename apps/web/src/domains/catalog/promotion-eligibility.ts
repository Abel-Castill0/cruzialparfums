import type { ProductVariantGroup } from "./product-purchase";

/**
 * Client-confirmed business rule (2026-09-06, see docs/client-decisions.md):
 * the 2 ml decant gift only applies to full-bottle ("frasco completo")
 * purchases. It is NOT eligible when a 3/5/10 ml decant is selected, even for
 * products that have no bottle variant at all.
 *
 * Centralized here so Product Detail and the catalog banner can never
 * diverge (see AGENTS.md — "no duplicar esta lógica").
 */
export const BOTTLE_GIFT_MESSAGE =
  "🎁 Regalo: Decant de 2 ml de cualquier perfume árabe del catálogo, a tu elección — solo con la compra de un frasco completo.";

export function isBottleGiftEligible(
  group: ProductVariantGroup | null | undefined,
): boolean {
  return group === "bottle";
}
