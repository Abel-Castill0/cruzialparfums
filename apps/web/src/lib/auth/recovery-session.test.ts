import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getClaims: vi.fn(),
  client: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mocks.client(),
}));

import { getRecoverySession } from "./recovery-session";

const USER = { id: "user-1" };

/** Shapes observed from Supabase Auth on this project's PKCE flow. */
const RECOVERY_AMR = [{ method: "recovery", timestamp: 1789854320 }];
const PASSWORD_AMR = [{ method: "password", timestamp: 1789854319 }];

function withClaims(claims: unknown, user: unknown = USER) {
  mocks.getUser.mockResolvedValue({ data: { user }, error: null });
  mocks.getClaims.mockResolvedValue({ data: claims ? { claims } : null, error: null });
  mocks.client.mockResolvedValue({ auth: { getUser: mocks.getUser, getClaims: mocks.getClaims } });
}

beforeEach(() => vi.clearAllMocks());

describe("getRecoverySession", () => {
  it("accepts a recovery session (AMREntry object form)", async () => {
    withClaims({ sub: "user-1", amr: RECOVERY_AMR });
    await expect(getRecoverySession()).resolves.toEqual({ status: "ready", userId: "user-1" });
  });

  it("accepts the RFC-8176 string form of amr", async () => {
    withClaims({ sub: "user-1", amr: ["recovery"] });
    await expect(getRecoverySession()).resolves.toEqual({ status: "ready", userId: "user-1" });
  });

  it("rejects an ordinary password session", async () => {
    withClaims({ sub: "user-1", amr: PASSWORD_AMR });
    await expect(getRecoverySession()).resolves.toEqual({ status: "not_recovery" });
  });

  it("rejects a session whose amr claim is missing entirely", async () => {
    withClaims({ sub: "user-1" });
    await expect(getRecoverySession()).resolves.toEqual({ status: "not_recovery" });
  });

  it.each([
    ["a non-array amr", "recovery"],
    ["a null amr", null],
    ["an amr of unrelated methods", [{ method: "totp" }, "password"]],
  ])("rejects %s", async (_label, amr) => {
    withClaims({ sub: "user-1", amr });
    await expect(getRecoverySession()).resolves.toEqual({ status: "not_recovery" });
  });

  it("rejects when the verified token's subject disagrees with the auth server", async () => {
    // A signature-valid token for someone else must never authorize a
    // password change for this user.
    withClaims({ sub: "someone-else", amr: RECOVERY_AMR });
    await expect(getRecoverySession()).resolves.toEqual({ status: "unavailable" });
  });

  it("fails closed when getClaims errors", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: USER }, error: null });
    mocks.getClaims.mockResolvedValue({ data: null, error: { message: "jwks unreachable" } });
    mocks.client.mockResolvedValue({ auth: { getUser: mocks.getUser, getClaims: mocks.getClaims } });

    await expect(getRecoverySession()).resolves.toEqual({ status: "unavailable" });
  });

  it("reports no_session when nobody is signed in", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    mocks.client.mockResolvedValue({ auth: { getUser: mocks.getUser, getClaims: mocks.getClaims } });

    await expect(getRecoverySession()).resolves.toEqual({ status: "no_session" });
  });

  it("reports not_configured when Supabase is absent", async () => {
    mocks.client.mockResolvedValue(null);
    await expect(getRecoverySession()).resolves.toEqual({ status: "not_configured" });
  });
});
