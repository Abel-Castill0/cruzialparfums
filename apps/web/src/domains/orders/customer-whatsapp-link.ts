/**
 * Admin-side "Contactar por WhatsApp" link for an order's customer snapshot
 * (Phase 4E2). This is the mirror of the storefront's own number lookup in
 * `domains/whatsapp/parfums-message-builder` — here the destination is the
 * CUSTOMER's phone, not the store's.
 *
 * The only validated Peru phone contract in this codebase (see
 * `validateAndResolveParfumsOrder` in `domains/orders/parfums-order-request`)
 * is: 9–15 digits, no format beyond that. That check runs at order-request
 * time, so most snapshots are a 9-digit Peru mobile number (starts with 9)
 * either bare or already carrying the "51" country code. Anything outside
 * that shape is historical/edge-case data this function must not guess a
 * country code for — it returns null and the UI falls back to showing/
 * copying the raw phone instead of a broken or wrong wa.me link.
 */
export function normalizeParfumsCustomerPhoneForWhatsApp(rawPhone: string): string | null {
  const digits = rawPhone.replace(/\D/g, "");
  if (digits.length === 9 && digits.startsWith("9")) {
    return `51${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("519")) {
    return digits;
  }
  return null;
}
