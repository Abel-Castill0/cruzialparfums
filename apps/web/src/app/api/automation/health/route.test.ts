import {afterEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({client:vi.fn()}));vi.mock("@/lib/supabase/server",()=>({createSupabaseAdminClient:mocks.client}));
import {GET} from "./route";
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
it("authenticates health before opening a privileged client",async()=>{vi.stubEnv("CRON_SECRET","fixture-secret-at-least-32-characters");expect((await GET(new Request("https://fixture.invalid/health"))).status).toBe(401);expect(mocks.client).not.toHaveBeenCalled();}); // gitleaks:allow
it("does not expose raw database failures",async()=>{const secret="fixture-secret-at-least-32-characters";vi.stubEnv("CRON_SECRET",secret);mocks.client.mockReturnValue({rpc:vi.fn().mockResolvedValue({error:{message:"secret database details"}})});const response=await GET(new Request("https://fixture.invalid/health",{headers:{Authorization:`Bearer ${secret}`}}));expect(response.status).toBe(503);expect(JSON.stringify(await response.json())).not.toContain("secret");}); // gitleaks:allow
