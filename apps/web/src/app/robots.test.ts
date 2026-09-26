import { afterEach, describe, expect, it, vi } from "vitest";

// The B14 cutover safeguard (getAuthoritativeIndexingPolicy) also requires a
// factual "launch ready" signal from the database before it will open the
// storefronts, even when the env flag is approved. Only the "opens after
// cutover" case below reaches this call — the closed-by-env cases return
// before ever consulting it.
vi.mock("@/lib/supabase/server", () => ({
  createSupabasePublicServerClient: () => ({
    rpc: async (name: string) =>
      name === "public_launch_ready" ? { data: true, error: null } : { data: null, error: new Error("unexpected rpc") },
  }),
}));

async function loadRobots(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const mod = await import("./robots");
  return mod.default();
}

const KEYS = ["VERCEL_ENV", "CRUZIAL_PRODUCTION_CUTOVER_APPROVED", "SITE_URL"];

describe("robots.txt indexing gate", () => {
  afterEach(() => { for (const key of KEYS) delete process.env[key]; });

  it("closes every non-production deployment to crawlers", async () => {
    for (const vercelEnv of [undefined, "preview"]) {
      const robots = await loadRobots({ VERCEL_ENV: vercelEnv, CRUZIAL_PRODUCTION_CUTOVER_APPROVED: "true", SITE_URL: "https://cruzialparfums.com" });
      expect(robots.rules).toEqual({ userAgent: "*", disallow: "/" });
      expect(robots.sitemap).toBeUndefined();
    }
  });

  it("stays closed on production until the cutover flag is set", async () => {
    const robots = await loadRobots({ VERCEL_ENV: "production", CRUZIAL_PRODUCTION_CUTOVER_APPROVED: undefined, SITE_URL: "https://cruzialparfums.com" });
    expect(robots.rules).toEqual({ userAgent: "*", disallow: "/" });
  });

  it("opens the storefronts after cutover and keeps private surfaces out", async () => {
    const robots = await loadRobots({ VERCEL_ENV: "production", CRUZIAL_PRODUCTION_CUTOVER_APPROVED: "true", SITE_URL: "https://cruzialparfums.com" });
    expect(robots.rules).toMatchObject({ userAgent: "*", allow: "/" });
    const disallow = (robots.rules as { disallow: string[] }).disallow;
    for (const path of ["/admin", "/auth", "/parfums/checkout", "/parfums/gracias", "/import/checkout", "/import/carrito"]) {
      expect(disallow).toContain(path);
    }
    expect(robots.sitemap).toBe("https://cruzialparfums.com/sitemap.xml");
  });
});
