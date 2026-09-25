import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

vi.mock("server-only", () => ({}));

const headersGet = vi.fn();
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: headersGet })),
}));

const readOrderAbuseHmacSecret = vi.fn();
vi.mock("@/lib/supabase/env", () => ({
  readOrderAbuseHmacSecret: () => readOrderAbuseHmacSecret(),
}));

import {
  canonicalizePhoneForAbuseKey,
  checkOrderRequestRateLimit,
  hashIpForAbuseKey,
  hashPhoneForAbuseKey,
  resolveTrustedRequestIp,
} from "./order-abuse";

const SECRET = "test-secret-do-not-reuse-elsewhere";
const ORIGINAL_VERCEL = process.env.VERCEL;

afterEach(() => {
  if (ORIGINAL_VERCEL === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = ORIGINAL_VERCEL;
});

function fakeClient(rpc: ReturnType<typeof vi.fn>): SupabaseClient<Database> {
  return { rpc } as unknown as SupabaseClient<Database>;
}

describe("resolveTrustedRequestIp", () => {
  it("trusts x-vercel-forwarded-for on a Vercel deployment", () => {
    expect(resolveTrustedRequestIp("203.0.113.7", true)).toBe("203.0.113.7");
  });

  it("takes only the first entry of a multi-hop header", () => {
    expect(resolveTrustedRequestIp("203.0.113.7, 10.0.0.1", true)).toBe("203.0.113.7");
  });

  it("does not trust the header outside a Vercel deployment (spoofable in an unknown proxy context)", () => {
    expect(resolveTrustedRequestIp("203.0.113.7", false)).toBeNull();
  });

  it("rejects a value that is not a valid IP", () => {
    expect(resolveTrustedRequestIp("not-an-ip", true)).toBeNull();
  });

  it("returns null when the header is absent", () => {
    expect(resolveTrustedRequestIp(null, true)).toBeNull();
  });
});

describe("canonicalizePhoneForAbuseKey", () => {
  it("maps a 9-digit Peru number to its 51-prefixed canonical form", () => {
    expect(canonicalizePhoneForAbuseKey("987654321")).toBe("51987654321");
  });

  it("treats the already-prefixed +51 form as equivalent", () => {
    expect(canonicalizePhoneForAbuseKey("+51 987 654 321")).toBe("51987654321");
    expect(canonicalizePhoneForAbuseKey("987654321")).toBe(
      canonicalizePhoneForAbuseKey("+51 987 654 321"),
    );
  });

  it("passes through other 9-15 digit values unchanged (digits only)", () => {
    expect(canonicalizePhoneForAbuseKey("+1 (415) 555-0132")).toBe("14155550132");
  });
});

describe("HMAC domain separation (ip vs phone)", () => {
  it("hashes the same raw value differently depending on identity kind", () => {
    expect(hashIpForAbuseKey(SECRET, "127.0.0.1")).not.toBe(hashPhoneForAbuseKey(SECRET, "127.0.0.1"));
  });
});

describe("checkOrderRequestRateLimit", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    headersGet.mockReset();
    readOrderAbuseHmacSecret.mockReset();
    readOrderAbuseHmacSecret.mockReturnValue(SECRET);
    delete process.env.VERCEL;
  });

  it("fails closed and never calls the RPC when the secret is missing", async () => {
    readOrderAbuseHmacSecret.mockReturnValue(null);
    const rpc = vi.fn();

    const result = await checkOrderRequestRateLimit({
      client: fakeClient(rpc),
      purpose: "order_request",
      businessUnit: "parfums",
      requestId: "11111111-1111-4111-8111-111111111111",
      phone: "987654321",
    });

    expect(result).toEqual({ kind: "unavailable" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed when the RPC returns an error", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "500", message: "boom" } });

    const result = await checkOrderRequestRateLimit({
      client: fakeClient(rpc),
      purpose: "order_request",
      businessUnit: "import",
      requestId: "11111111-1111-4111-8111-111111111111",
      phone: "987654321",
    });

    expect(result).toEqual({ kind: "unavailable" });
  });

  it("returns denied with the RPC's retry_after_seconds", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ allowed: false, retry_after_seconds: 600, reason: "ip_10m_limit", duplicate_request: false }],
      error: null,
    });

    const result = await checkOrderRequestRateLimit({
      client: fakeClient(rpc),
      purpose: "order_request",
      businessUnit: "parfums",
      requestId: "11111111-1111-4111-8111-111111111111",
      phone: "987654321",
    });

    expect(result).toEqual({ kind: "denied", retryAfterSeconds: 600 });
  });

  it("returns allowed (including for an allowed duplicate_request retry)", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ allowed: true, retry_after_seconds: 0, reason: null, duplicate_request: true }],
      error: null,
    });

    const result = await checkOrderRequestRateLimit({
      client: fakeClient(rpc),
      purpose: "order_request",
      businessUnit: "parfums",
      requestId: "11111111-1111-4111-8111-111111111111",
      phone: "987654321",
    });

    expect(result).toEqual({ kind: "allowed" });
  });

  it("never sends raw phone or raw IP to the RPC — only hex digests", async () => {
    headersGet.mockReturnValue("203.0.113.9");
    process.env.VERCEL = "1";
    const rpc = vi.fn().mockResolvedValue({
      data: [{ allowed: true, retry_after_seconds: 0, reason: null, duplicate_request: false }],
      error: null,
    });

    await checkOrderRequestRateLimit({
      client: fakeClient(rpc),
      purpose: "order_request",
      businessUnit: "parfums",
      requestId: "11111111-1111-4111-8111-111111111111",
      phone: "987654321",
    });

    const call = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(call.p_ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(call.p_phone_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(call.p_ip_hash).not.toBe("203.0.113.9");
    expect(JSON.stringify(call)).not.toContain("203.0.113.9");
    expect(JSON.stringify(call)).not.toContain("987654321");
  });

  it("is deterministic: the same canonical phone across two calls hashes identically", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ allowed: true, retry_after_seconds: 0, reason: null, duplicate_request: false }],
      error: null,
    });

    await checkOrderRequestRateLimit({
      client: fakeClient(rpc),
      purpose: "order_request",
      businessUnit: "parfums",
      requestId: "11111111-1111-4111-8111-111111111111",
      phone: "987654321",
    });
    await checkOrderRequestRateLimit({
      client: fakeClient(rpc),
      purpose: "order_request",
      businessUnit: "parfums",
      requestId: "22222222-2222-4222-8222-222222222222",
      phone: "+51 987 654 321",
    });

    const firstHash = (rpc.mock.calls[0][1] as Record<string, unknown>).p_phone_hash;
    const secondHash = (rpc.mock.calls[1][1] as Record<string, unknown>).p_phone_hash;
    expect(firstHash).toBe(secondHash);
  });

  it("passes null ip hash when there is no trusted IP (non-Vercel, phone limiting still applies)", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ allowed: true, retry_after_seconds: 0, reason: null, duplicate_request: false }],
      error: null,
    });

    await checkOrderRequestRateLimit({
      client: fakeClient(rpc),
      purpose: "order_request",
      businessUnit: "parfums",
      requestId: "11111111-1111-4111-8111-111111111111",
      phone: "987654321",
    });

    const call = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(call.p_ip_hash).toBeNull();
    expect(call.p_phone_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("calls check_abuse_rate_limit with the caller's purpose forwarded verbatim", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ allowed: true, retry_after_seconds: 0, reason: null, duplicate_request: false }],
      error: null,
    });

    await checkOrderRequestRateLimit({
      client: fakeClient(rpc),
      purpose: "complaint",
      businessUnit: "parfums",
      requestId: "11111111-1111-4111-8111-111111111111",
      phone: "987654321",
    });

    expect(rpc.mock.calls[0][0]).toBe("check_abuse_rate_limit");
    expect((rpc.mock.calls[0][1] as Record<string, unknown>).p_purpose).toBe("complaint");
  });

  it("Gate A2: an order_request call and a complaint call for the same identity are independent RPC invocations (never merged into one quota)", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ allowed: true, retry_after_seconds: 0, reason: null, duplicate_request: false }],
      error: null,
    });

    await checkOrderRequestRateLimit({
      client: fakeClient(rpc),
      purpose: "order_request",
      businessUnit: "parfums",
      requestId: "11111111-1111-4111-8111-111111111111",
      phone: "987654321",
    });
    await checkOrderRequestRateLimit({
      client: fakeClient(rpc),
      purpose: "complaint",
      businessUnit: "parfums",
      requestId: "22222222-2222-4222-8222-222222222222",
      phone: "987654321",
    });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect((rpc.mock.calls[0][1] as Record<string, unknown>).p_purpose).toBe("order_request");
    expect((rpc.mock.calls[1][1] as Record<string, unknown>).p_purpose).toBe("complaint");
  });
});
