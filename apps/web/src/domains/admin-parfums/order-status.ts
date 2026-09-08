/**
 * Centralized Admin Orders status → UX copy mapping (Phase 4E2).
 *
 * The only confirmed operational status today is
 * `pending_whatsapp_confirmation` — a web request handed off to WhatsApp,
 * NOT a paid/confirmed/delivered order. Never render the raw DB enum value
 * to an admin; an unrecognized value (future status, bad data) falls back to
 * a safe, honest label instead of guessing what it means.
 */
const ORDER_STATUS_LABELS: Record<string, string> = {
  pending_whatsapp_confirmation: "Pendiente por WhatsApp",
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? "Estado no reconocido";
}
