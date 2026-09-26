import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DisabledEmailProvider, WhatsAppCloudProvider, readWhatsAppConfig, type NotificationProvider, type NotificationUnit } from "./provider";

export async function processNotificationBatch(
  client: SupabaseClient<Database>,
  resolveProvider: (unit: NotificationUnit, channel: string) => NotificationProvider = (unit, channel) =>
    channel === "whatsapp" ? new WhatsAppCloudProvider(readWhatsAppConfig(unit)) : new DisabledEmailProvider(),
) {
  const started = await client.rpc("worker_record_health", { p_status: "running", p_processed: 0 });
  if (started.error) return { ok: false, processed: 0 };
  const units = await client.from("business_units").select("id,code");
  const claimed = await client.rpc("worker_claim_notifications", { p_batch: 5 });
  if (units.error || claimed.error) {
    await client.rpc("worker_record_health", { p_status: "failed", p_processed: 0 });
    return { ok: false, processed: 0 };
  }
  let processed = 0;
  let ok = true;
  for (const job of claimed.data ?? []) {
    const unitCode = units.data.find(unit => unit.id === job.business_unit_id)?.code;
    if ((unitCode !== "parfums" && unitCode !== "import") || !job.lease_token) { ok = false; continue; }
    const provider = resolveProvider(unitCode, job.channel);
    // Configuration failures have no side effect and don't use an attempt.
    if (!provider.ready(job.template_key)) {
      const blocked = await client.rpc("worker_finish_notification", { p_id: job.id,
        p_lease_token: job.lease_token, p_outcome: "blocked", p_error_safe: "provider_not_configured" });
      if (blocked.error) ok = false;
      processed++;
      continue;
    }
    const begun = await client.rpc("worker_begin_notification", { p_id: job.id, p_lease_token: job.lease_token });
    if (begun.error) { ok = false; continue; }
    const reference = job.template_data && typeof job.template_data === "object" && !Array.isArray(job.template_data)
      && typeof job.template_data.reference === "string" ? job.template_data.reference : "";
    const result = await provider.send({ event: job.template_key, recipient: job.recipient ?? "", reference,
      idempotencyKey: job.idempotency_key });
    const finished = await client.rpc("worker_finish_notification", {
      p_id: job.id, p_lease_token: job.lease_token, p_outcome: result.status,
      ...(result.status === "sent" ? { p_provider_message_id: result.providerMessageId } : { p_error_safe: result.error }),
    });
    if (finished.error) ok = false;
    processed++;
  }
  await client.rpc("worker_record_health", { p_status: ok ? "ok" : "failed", p_processed: processed });
  return { ok, processed };
}
