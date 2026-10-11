import { afterEach, describe, expect, it, vi } from "vitest";

// Indexing on Production follows the owner's persisted switch (public_search_indexing_enabled). Content completeness
// (public_launch_ready) must NOT be consulted: the mock answers false for it and fails the test if it is called.
const state = vi.hoisted(() => ({ enabled: false as boolean, error: null as Error | null, calls: [] as string[] }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabasePublicServerClient: () => ({
    rpc: async (name: string) => {
      state.calls.push(name);
      if (name === "public_search_indexing_enabled") return state.error ? { data: null, error: state.error } : { data: state.enabled, error: null };
      if (name === "public_launch_ready") return { data: false, error: null };
      return { data: null, error: new Error("unexpected rpc") };
    },
  }),
}));

async function loadRobots(env: Record<string, string | undefined>, enabled: boolean, error: Error | null = null) {
  vi.resetModules();
  state.enabled = enabled;
  state.error = error;
  state.calls = [];
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const mod = await import("./robots");
  return mod.default();
}

const KEYS = ["VERCEL_ENV", "CRUZIAL_INDEXING_FORCE_OFF", "SITE_URL"];
const SITE = "https://cruzialparfums.com";
const CLOSED = { userAgent: "*", disallow: "/" };

describe("robots.txt indexing gate", () => {
  afterEach(() => { for (const key of KEYS) delete process.env[key]; });

  it("closes every non-production deployment to crawlers, even with the owner switch on", async () => {
    for (const vercelEnv of [undefined, "preview"]) {
      const robots = await loadRobots({ VERCEL_ENV: vercelEnv, SITE_URL: SITE }, true);
      expect(robots.rules).toEqual(CLOSED);
      expect(robots.sitemap).toBeUndefined();
      expect(state.calls).toEqual([]);
    }
  });

  it("stays closed on production while the owner switch is off (the default)", async () => {
    const robots = await loadRobots({ VERCEL_ENV: "production", SITE_URL: SITE }, false);
    expect(robots.rules).toEqual(CLOSED);
  });

  it("opens the storefronts when the owner enabled it, regardless of incomplete content, and keeps private surfaces out", async () => {
    const robots = await loadRobots({ VERCEL_ENV: "production", SITE_URL: SITE }, true);
    expect(robots.rules).toMatchObject({ userAgent: "*", allow: "/" });
    const disallow = (robots.rules as { disallow: string[] }).disallow;
    for (const path of ["/admin", "/auth", "/parfums/checkout", "/parfums/gracias", "/import/checkout", "/import/carrito"]) {
      expect(disallow).toContain(path);
    }
    expect(robots.sitemap).toBe(`${SITE}/sitemap.xml`);
    expect(state.calls).not.toContain("public_launch_ready");
  });

  it("fails closed when the switch cannot be read", async () => {
    const robots = await loadRobots({ VERCEL_ENV: "production", SITE_URL: SITE }, true, new Error("db down"));
    expect(robots.rules).toEqual(CLOSED);
  });

  it("CRUZIAL_INDEXING_FORCE_OFF=true closes production without reading the switch", async () => {
    const robots = await loadRobots({ VERCEL_ENV: "production", SITE_URL: SITE, CRUZIAL_INDEXING_FORCE_OFF: "true" }, true);
    expect(robots.rules).toEqual(CLOSED);
    expect(state.calls).toEqual([]);
  });
});
