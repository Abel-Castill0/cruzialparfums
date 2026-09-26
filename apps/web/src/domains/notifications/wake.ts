import "server-only";
import { after } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { processNotificationBatch } from "./worker";

/** Persistence has already committed. The durable queue and scheduler retain
 * responsibility if this best-effort immediate wake is interrupted. */
export function wakeNotificationWorker(): void {
  try {
    after(async () => {
      const client = createSupabaseAdminClient();
      if (client) await processNotificationBatch(client);
    });
  } catch {
    // No response body, customer data, provider error or credential is logged.
  }
}
