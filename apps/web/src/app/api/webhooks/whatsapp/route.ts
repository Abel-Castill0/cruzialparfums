import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { parseWhatsAppDeliveryEvents, safeSecretEqual, verifyWhatsAppSignature } from "@/domains/notifications/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const token = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  const challenge = query.get("hub.challenge");
  if (!token) return new Response("Not configured", { status: 503 });
  if (query.get("hub.mode") !== "subscribe" || !safeSecretEqual(query.get("hub.verify_token") ?? "", token)
      || !challenge || !/^\d{1,256}$/.test(challenge)) return new Response("Unauthorized", { status: 401 });
  return new Response(challenge, { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
}

async function boundedBody(request: Request): Promise<Uint8Array | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 262144) { await reader.cancel(); return null; }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function POST(request: Request) {
  if (!process.env.WHATSAPP_APP_SECRET) return Response.json({ error: "not_configured" }, { status: 503 });
  const bytes = await boundedBody(request);
  if (!bytes) return Response.json({ error: "invalid_body" }, { status: 413 });
  if (!verifyWhatsAppSignature(bytes, request.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { return Response.json({ error: "invalid_body" }, { status: 400 }); }
  const allowedPhoneIds = [process.env.WHATSAPP_PARFUMS_PHONE_NUMBER_ID, process.env.WHATSAPP_IMPORT_PHONE_NUMBER_ID]
    .filter((value): value is string => !!value && /^\d+$/.test(value));
  const events = parseWhatsAppDeliveryEvents(body, allowedPhoneIds);
  const client = createSupabaseAdminClient();
  if (!client) return Response.json({ error: "not_configured" }, { status: 503 });
  for (const event of events) {
    const saved = await client.rpc("worker_record_delivery", {
      p_message_id: event.messageId, p_status: event.status, p_occurred_at: event.occurredAt,
    });
    if (saved.error) return Response.json({ error: "temporarily_unavailable" }, { status: 503 });
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
