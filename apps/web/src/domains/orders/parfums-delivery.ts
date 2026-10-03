import { SHALOM_AGENCIES, type ShalomAgency } from "./shalom-agencies";

/**
 * Delivery choices for Cruzial Parfums (docs/client-decisions.md — Shipping).
 * The order RPC accepts only `district`, `delivery` and `note` in the delivery
 * snapshot, so the chosen agency travels inside the `delivery` text and the
 * server re-derives every accepted value from this module.
 */
export const PARFUMS_SHALOM_DELIVERY = "Agencia Shalom (Lima y todo el Perú)";
export const PARFUMS_MOTORIZADO_DELIVERY = "Motorizado (cotización por WhatsApp)";

export const PARFUMS_DELIVERY_OPTIONS = [PARFUMS_SHALOM_DELIVERY, PARFUMS_MOTORIZADO_DELIVERY] as const;

export type ParfumsDeliveryMethod = "shalom" | "motorizado";

export function shalomAgencyDelivery(agency: ShalomAgency) {
  return `Agencia Shalom: ${agency.name} (${agency.district})`;
}

const AGENCY_DELIVERIES: ReadonlySet<string> = new Set(SHALOM_AGENCIES.map(shalomAgencyDelivery));

/** The delivery method behind an accepted `delivery` value, or null if it is not one we offer. */
export function parfumsDeliveryMethod(delivery: string): ParfumsDeliveryMethod | null {
  if (delivery === PARFUMS_MOTORIZADO_DELIVERY) return "motorizado";
  if (delivery === PARFUMS_SHALOM_DELIVERY || AGENCY_DELIVERIES.has(delivery)) return "shalom";
  return null;
}
