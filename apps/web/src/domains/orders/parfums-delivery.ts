import { SHALOM_AGENCIES, type ShalomAgency } from "./shalom-agencies";

/**
 * Delivery choices for Cruzial Parfums (docs/parfums-shipping.md).
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

const AGENCY_PREFIX = "Agencia Shalom: ";

/**
 * Operator-facing reading of a stored `delivery` text: method label and, for a
 * specific Shalom agency, the agency. Derived, not stored, so it needs no
 * migration; a text we never offered (legacy orders) yields a null method.
 */
export function describeParfumsDelivery(delivery: string): { method: ParfumsDeliveryMethod | null; methodLabel: string; agency: string | null } {
  const method = parfumsDeliveryMethod(delivery);
  if (method === "motorizado") return { method, methodLabel: "Motorizado (Lima) · se cotiza por WhatsApp", agency: null };
  if (method === "shalom") {
    const agency = delivery.startsWith(AGENCY_PREFIX) ? delivery.slice(AGENCY_PREFIX.length) : null;
    return { method, methodLabel: "Agencia Shalom", agency };
  }
  return { method: null, methodLabel: delivery.trim() || "Sin indicar", agency: null };
}
