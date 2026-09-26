import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: mocks.client }));
import { GET, POST } from "./route";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("WhatsApp webhook boundary", () => {
  it("requires the verification token and returns a plaintext challenge", async () => {
    vi.stubEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN", "fixture-verify-token");
    const valid = await GET(new Request("https://fixture.invalid/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=fixture-verify-token&hub.challenge=12345"));
    expect(valid.status).toBe(200);
    expect(await valid.text()).toBe("12345");
    expect((await GET(new Request("https://fixture.invalid/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345"))).status).toBe(401);
  });
  it("rejects unsigned status changes before creating a privileged client", async () => {
    vi.stubEnv("WHATSAPP_APP_SECRET", "fixture-app-secret");
    expect((await POST(new Request("https://fixture.invalid/api/webhooks/whatsapp", { method: "POST", body: "{}" }))).status).toBe(401);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("ingests only verified status proof with a deterministic fake database", async () => {
    vi.stubEnv("WHATSAPP_APP_SECRET", "fixture-app-secret");
    vi.stubEnv("WHATSAPP_PARFUMS_PHONE_NUMBER_ID", "123");
    mocks.client.mockReturnValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ error: null });
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: {
      metadata: { phone_number_id: "123" }, statuses: [{ id: "fixture-message", status: "read", timestamp: "1750000000" }],
    } }] }] });
    const signature = `sha256=${createHmac("sha256", "fixture-app-secret").update(body).digest("hex")}`;
    const response = await POST(new Request("https://fixture.invalid/api/webhooks/whatsapp", { method: "POST", body, headers: { "x-hub-signature-256": signature } }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("worker_record_delivery", { p_message_id: "fixture-message", p_status: "read", p_occurred_at: new Date(1750000000000).toISOString() });
  });
});
