/**
 * Centralized Admin Orders status → UX copy mapping.
 *
 * `confirmed` means coordination was confirmed by WhatsApp, NOT that a
 * payment was processed — Parfums never takes payment on the website.
 * An unrecognized value (future status, bad data) falls back to a safe,
 * honest label instead of guessing what it means.
 */
const ORDER_STATUS_LABELS: Record<string, string> = {
  pending_whatsapp_confirmation: "Pendiente por WhatsApp",
  confirmed: "Confirmada por WhatsApp",
  fulfilled: "Atendida / Completada",
  cancelled: "Cancelada",
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? "Estado no reconocido";
}

/**
 * Returns the set of status transitions allowed from a given current status.
 * Mirrors the transition matrix enforced server-side by
 * admin_parfums_update_order_status (20260920020000) — this is UX gating
 * only; the RPC is the actual authority and re-validates every transition.
 */
export function allowedParfumsOrderTransitions(status: string): string[] {
  switch (status) {
    case "pending_whatsapp_confirmation":
      return ["confirmed", "cancelled"];
    case "confirmed":
      return ["fulfilled", "cancelled"];
    default:
      return [];
  }
}
