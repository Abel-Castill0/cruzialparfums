import type { LegacyProductType } from "@/domains/catalog/types";

/**
 * Client-confirmed wholesale line and per-category discount (2026-09-06),
 * modeled as configuration per docs/client-decisions.md — NOT a rewrite of
 * the 93 legacy `unit/m4/m12` tiers already shown on /parfums/mayorista
 * (those stay `verificationStatus: legacy`, parity-only, per
 * docs/client-decisions.md CLIENT_PROVIDED_PENDING_RECONFIRMATION).
 *
 * This policy is a distinct, newer, narrower confirmation:
 *   "9PM, Mandarin Sky, Khamrah Clásico, Khamrah Qahwa, Sublime, Yara Candy,
 *    Yara Pink — perfume árabe: -S/5, designer: -S/7, niche: -S/10, 40
 *    unidades."
 *
 * `WHOLESALE_MIN_QUANTITY` (40) is confirmed as a number. Its SCOPE is not:
 * the client did not say whether 40 means 40 units combined across the
 * eligible products in one order, or 40 units of the same SKU. Per
 * docs/client-decisions.md this is registered as
 * `wholesaleThresholdScope = UNKNOWN` — no calculation here assumes either
 * reading. Copy referencing the 40-unit modality must state the number
 * without asserting how it is counted.
 */

export type WholesaleThresholdScope = "combined" | "per_sku" | "UNKNOWN";

export const WHOLESALE_THRESHOLD_SCOPE: WholesaleThresholdScope = "UNKNOWN";

export const WHOLESALE_MIN_QUANTITY = 40;

export const WHOLESALE_ELIGIBLE_LEGACY_IDS: readonly string[] = [
  "9pm",
  "mandarin-sky",
  "khamrah-clasico",
  "khamrah-qahwa",
  "sublime",
  "yara-candy",
  "yara-pink",
];

export const WHOLESALE_DISCOUNT_BY_CATEGORY: Partial<
  Record<Exclude<LegacyProductType, "combo">, number>
> = {
  arab: 5,
  designer: 7,
  niche: 10,
};

export function isWholesalePolicyEligible(legacyId: string): boolean {
  return WHOLESALE_ELIGIBLE_LEGACY_IDS.includes(legacyId);
}

export function getWholesaleCategoryDiscount(
  type: LegacyProductType,
): number | undefined {
  if (type === "combo") return undefined;
  return WHOLESALE_DISCOUNT_BY_CATEGORY[type];
}
