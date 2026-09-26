import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { processNotificationBatch } from "./worker";

const job = { id: "fixture-job", business_unit_id: "fixture-unit", lease_token: "fixture-lease",
  channel: "whatsapp", template_key: "order_received", recipient: "51999000123",
  template_data: { reference: "TEST-123" }, idempotency_key: "fixture-key" };
function fakeClient(invalidLease = false, authorized: Record<string, unknown> = { ...job, status: "sending" }) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "worker_claim_notifications") return { data: [job], error: null };
    if (name === "worker_begin_notification" && invalidLease) return { data: null, error: { code: "P2036" } };
    if (name === "worker_begin_notification") return { data: authorized, error: null };
    return { data: null, error: null };
  });
  const client = { rpc, from: () => ({ select: async () => ({ data: [{ id: "fixture-unit", code: "parfums" }], error: null }) }) };
  return { rpc, client: client as unknown as SupabaseClient<Database> };
}
describe("notification worker", () => {
  it("uses a claimed lease, records intent and persists provider proof", async () => {
    const { client, rpc } = fakeClient();
    const provider = { ready: () => true, send: vi.fn(async () => ({ status: "sent" as const, providerMessageId: "fixture-provider-id" })) };
    expect(await processNotificationBatch(client, () => provider)).toEqual({ ok: true, processed: 1 });
    expect(provider.send).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("worker_begin_notification", { p_id: "fixture-job", p_lease_token: "fixture-lease" });
    expect(rpc).toHaveBeenCalledWith("worker_finish_notification", {
      p_id: "fixture-job", p_lease_token: "fixture-lease", p_outcome: "sent", p_provider_message_id: "fixture-provider-id",
    });
  });
  it("does not start a send or spend attempts without provider configuration", async () => {
    const { client, rpc } = fakeClient();
    const provider = { ready: () => false, send: vi.fn(async () => ({ status: "blocked" as const, error: "provider_not_configured" })) };
    await processNotificationBatch(client, () => provider);
    expect(provider.send).not.toHaveBeenCalled();
    expect(rpc.mock.calls.some(([name]) => name === "worker_begin_notification")).toBe(false);
    expect(rpc).toHaveBeenCalledWith("worker_finish_notification", expect.objectContaining({ p_outcome: "blocked", p_error_safe: "provider_not_configured" }));
  });
  it("cannot send when its lease has been lost", async () => {
    const { client } = fakeClient(true);
    const provider = { ready: () => true, send: vi.fn(async () => ({ status: "sent" as const, providerMessageId: "fixture" })) };
    expect((await processNotificationBatch(client, () => provider)).ok).toBe(false);
    expect(provider.send).not.toHaveBeenCalled();
  });
  it("persists uncertain outcomes without automatically issuing a second request", async () => {
    const { client, rpc } = fakeClient();
    const provider = { ready: () => true, send: vi.fn(async () => ({ status: "uncertain" as const, error: "provider_timeout" })) };
    await processNotificationBatch(client, () => provider);
    expect(provider.send).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("worker_finish_notification", expect.objectContaining({ p_outcome: "uncertain", p_error_safe: "provider_timeout" }));
  });
  it("never calls the provider when the dispatch commit point cancels (complaint resolved before authorization)", async () => {
    const { client, rpc } = fakeClient(false, { ...job, status: "cancelled", last_error_safe: "resolved_before_dispatch" });
    const provider = { ready: () => true, send: vi.fn(async () => ({ status: "sent" as const, providerMessageId: "never" })) };
    expect(await processNotificationBatch(client, () => provider)).toEqual({ ok: true, processed: 1 });
    expect(provider.send).not.toHaveBeenCalled();
    expect(rpc.mock.calls.some(([name]) => name === "worker_finish_notification")).toBe(false);
  });
  it("builds the provider call from the authoritative authorized row, not the stale claimed job", async () => {
    const { client } = fakeClient(false, { ...job, status: "sending", recipient: "51999000999",
      template_key: "complaint_overdue", template_data: { reference: "AUTHORITATIVE" }, idempotency_key: "authorized-key" });
    const provider = { ready: () => true, send: vi.fn(async () => ({ status: "sent" as const, providerMessageId: "p" })) };
    await processNotificationBatch(client, () => provider);
    expect(provider.send).toHaveBeenCalledWith({ event: "complaint_overdue", recipient: "51999000999",
      reference: "AUTHORITATIVE", idempotencyKey: "authorized-key" });
  });
  it("treats a missing authorization row as a failure and does not send", async () => {
    const { client } = fakeClient(false, null as unknown as Record<string, unknown>);
    const provider = { ready: () => true, send: vi.fn(async () => ({ status: "sent" as const, providerMessageId: "p" })) };
    expect((await processNotificationBatch(client, () => provider)).ok).toBe(false);
    expect(provider.send).not.toHaveBeenCalled();
  });
});
