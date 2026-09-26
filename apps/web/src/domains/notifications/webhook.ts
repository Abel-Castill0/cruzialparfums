import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export function safeSecretEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export function verifyWhatsAppSignature(body: string | Uint8Array, signature: string | null, secret: string | undefined): boolean {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  return safeSecretEqual(signature.toLowerCase(), expected);
}

export type DeliveryEvent = { messageId: string; status: "sent" | "delivered" | "read" | "failed"; occurredAt: string };

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Accept only bounded status events for explicitly configured business numbers.
 * Incoming message bodies, contacts and error bodies are never retained. */
export function parseWhatsAppDeliveryEvents(body: unknown, allowedPhoneIds: string[]): DeliveryEvent[] {
  const root = object(body);
  if (root?.object !== "whatsapp_business_account" || !Array.isArray(root.entry)) return [];
  const result: DeliveryEvent[] = [];
  for (const entry of root.entry.slice(0, 20)) {
    const changes = object(entry)?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes.slice(0, 20)) {
      const envelope = object(change);
      const value = object(envelope?.value);
      const phoneId = object(value?.metadata)?.phone_number_id;
      if (envelope?.field !== "messages" || typeof phoneId !== "string" || !allowedPhoneIds.includes(phoneId)
          || !Array.isArray(value?.statuses)) continue;
      for (const raw of value.statuses.slice(0, 100)) {
        const event = object(raw);
        if (!event || typeof event.id !== "string" || !event.id || event.id.length > 200
            || !["sent", "delivered", "read", "failed"].includes(String(event.status))
            || typeof event.timestamp !== "string" || !/^\d{1,12}$/.test(event.timestamp)) continue;
        const timestamp = Number(event.timestamp) * 1000;
        if (!Number.isFinite(timestamp) || timestamp < Date.UTC(2000, 0, 1) || timestamp > Date.now() + 300000) continue;
        result.push({ messageId: event.id, status: event.status as DeliveryEvent["status"], occurredAt: new Date(timestamp).toISOString() });
        if (result.length >= 100) return result;
      }
    }
  }
  return result;
}
