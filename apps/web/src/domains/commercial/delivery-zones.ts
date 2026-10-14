/**
 * Motorcycle ("motorizado") delivery zones. Source of truth: the `delivery_zones` table (docs/commercial-rules.md).
 *
 * Decided 2026-10-14: a restricted district only turns the motorcycle option off. It NEVER blocks the order: Shalom
 * (all of Peru, quoted over WhatsApp) is always available.
 */
export type DeliveryZone = { district: string; isRestricted: boolean };

/**
 * - `available`: a covered Lima district.
 * - `restricted`: a Lima district the motorcycle does not cover.
 * - `outside_zones`: not a district we list (another city or region): Shalom only.
 * - `not_enforced`: the zone table is empty (the owner has not validated the list yet), so nothing is enforced.
 */
export type MotorizadoAvailability = "available" | "restricted" | "outside_zones" | "not_enforced";

export const MOTORIZADO_UNAVAILABLE_MESSAGE =
  "El motorizado no llega a este distrito. Elige una agencia Shalom: llega a todo el Perú y tu pedido se registra igual.";

/** Case- and accent-insensitive key, so "Jesus Maria" and "Jesús María" are the same district. */
export function districtKey(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function motorizadoAvailability(district: string, zones: readonly DeliveryZone[]): MotorizadoAvailability {
  if (zones.length === 0) return "not_enforced";
  const key = districtKey(district);
  const zone = zones.find((item) => districtKey(item.district) === key);
  if (!zone) return "outside_zones";
  return zone.isRestricted ? "restricted" : "available";
}

export function isMotorizadoAllowed(availability: MotorizadoAvailability): boolean {
  return availability === "available" || availability === "not_enforced";
}

/** Names the checkout map and select must mark as unavailable for the motorcycle. */
export function restrictedDistrictNames(zones: readonly DeliveryZone[]): string[] {
  return zones.filter((zone) => zone.isRestricted).map((zone) => zone.district);
}
