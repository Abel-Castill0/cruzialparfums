import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { automationAuthorized } from "@/domains/notifications/automation-auth";
import { processNotificationBatch } from "@/domains/notifications/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!automationAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const client = createSupabaseAdminClient();
  if (!client) return Response.json({ error: "automation_not_configured" }, { status: 503 });
  const result = await processNotificationBatch(client);
  return Response.json(result, { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
