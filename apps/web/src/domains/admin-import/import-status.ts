/**
 * Import order status → UX copy mapping (Phase 4J5C1).
 *
 * Labels must never imply online payment, confirmed delivery, or anything
 * the system does not actually know. `confirmed` means coordination was
 * confirmed, NOT that a payment was processed.
 */
const IMPORT_ORDER_STATUS_LABELS: Record<string, string> = {
  pending_whatsapp_confirmation: "Pendiente por WhatsApp",
  confirmed: "Coordinación confirmada",
  fulfilled: "Completado",
  cancelled: "Cancelado",
};

export function importOrderStatusLabel(status: string): string {
  return IMPORT_ORDER_STATUS_LABELS[status] ?? "Estado no reconocido";
}

/**
 * Returns the set of status transitions allowed from a given current status.
 */
export function allowedImportOrderTransitions(status: string): string[] {
  switch (status) {
    case "pending_whatsapp_confirmation":
      return ["confirmed", "cancelled"];
    case "confirmed":
      return ["fulfilled", "cancelled"];
    case "fulfilled":
      return [];
    case "cancelled":
      return [];
    default:
      return [];
  }
}

/**
 * Import customer verified status → UX copy mapping.
 */
const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  pending_verification: "Pendiente de verificación",
  new: "Nuevo",
  returning: "Recurrente",
};

export function importCustomerStatusLabel(status: string): string {
  return CUSTOMER_STATUS_LABELS[status] ?? "Estado no reconocido";
}
