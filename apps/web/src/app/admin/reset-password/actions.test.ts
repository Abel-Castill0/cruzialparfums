import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The password-change boundary.
 *
 * A POST can reach this Server Action without the page ever rendering, so
 * the action — not the page — is what has to prove the session came from a
 * recovery link. The case that matters most is the negative one: an
 * ordinary signed-in admin (valid user, active membership, aal1, password
 * login) must not be able to set a new password, because that would let
 * anyone holding a stolen password take the account over without ever
 * passing MFA.
 */

const mocks = vi.hoisted(() => ({
  getRecoverySession: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    mocks.redirect(path);
    // Next's redirect() throws to unwind; mimic that so control flow matches.
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("@/lib/auth/recovery-session", () => ({
  getRecoverySession: mocks.getRecoverySession,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    auth: {
      updateUser: (...args: unknown[]) => mocks.updateUser(...args),
      signOut: (...args: unknown[]) => mocks.signOut(...args),
    },
  }),
}));

import { updateAdminPassword } from "./actions";

const STRONG = "Abcdefghij-KL12345!";

function form(password: string, confirmPassword = password) {
  const data = new FormData();
  data.set("password", password);
  data.set("confirmPassword", confirmPassword);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});

describe("updateAdminPassword — recovery proof required", () => {
  it("denies a normal aal1 admin session and never calls updateUser", async () => {
    // Exactly what an ordinary password login produces: a real user with a
    // real membership, but no `recovery` in amr.
    mocks.getRecoverySession.mockResolvedValue({ status: "not_recovery" });

    const result = await updateAdminPassword({ error: null }, form(STRONG));

    expect(result.error).toBe("El enlace de recuperación ya no es válido. Solicita uno nuevo.");
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["no session at all", "no_session"],
    ["unreadable/invalid claims", "unavailable"],
    ["backend not configured", "not_configured"],
  ])("denies when there is %s and never calls updateUser", async (_label, status) => {
    mocks.getRecoverySession.mockResolvedValue({ status });

    const result = await updateAdminPassword({ error: null }, form(STRONG));

    expect(result.error).not.toBeNull();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("allows a proven recovery session, then revokes sessions globally", async () => {
    mocks.getRecoverySession.mockResolvedValue({ status: "ready", userId: "user-1" });

    await expect(updateAdminPassword({ error: null }, form(STRONG))).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.updateUser).toHaveBeenCalledWith({ password: STRONG });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/login");
  });

  it("rejects a short password before any session work happens", async () => {
    mocks.getRecoverySession.mockResolvedValue({ status: "ready", userId: "user-1" });

    const result = await updateAdminPassword({ error: null }, form("short1!A"));

    expect(result.error).toContain("12 caracteres");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("rejects mismatched confirmation", async () => {
    mocks.getRecoverySession.mockResolvedValue({ status: "ready", userId: "user-1" });

    const result = await updateAdminPassword({ error: null }, form(STRONG, `${STRONG}x`));

    expect(result.error).toBe("Las contraseñas no coinciden.");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("does not sign out when the password update itself fails", async () => {
    mocks.getRecoverySession.mockResolvedValue({ status: "ready", userId: "user-1" });
    mocks.updateUser.mockResolvedValue({ error: { message: "weak password" } });

    const result = await updateAdminPassword({ error: null }, form(STRONG));

    expect(result.error).toBe("No se pudo actualizar la contraseña. Intenta de nuevo.");
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
