import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), process: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: mocks.client }));
vi.mock("@/domains/notifications/worker", () => ({ processNotificationBatch: mocks.process }));
import { GET } from "./route";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("worker endpoint", () => {
  it("denies unauthenticated processing before reaching the database", async () => {
    vi.stubEnv("CRON_SECRET", "fixture-automation-secret-with-32-characters");
    expect((await GET(new Request("https://fixture.invalid/api/automation/process"))).status).toBe(401);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("never treats absent credentials as authorization", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(new Request("https://fixture.invalid/api/automation/process", { headers: { Authorization: "Bearer undefined" } }))).status).toBe(401);
  });
  it("allows the configured scheduler and returns only safe counts", async () => {
    const secret = "fixture-automation-secret-with-32-characters";
    vi.stubEnv("CRON_SECRET", secret);
    mocks.client.mockReturnValue({});
    mocks.process.mockResolvedValue({ ok: true, processed: 2 });
    const response = await GET(new Request("https://fixture.invalid/api/automation/process", { headers: { Authorization: `Bearer ${secret}` } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, processed: 2 });
  });
});
