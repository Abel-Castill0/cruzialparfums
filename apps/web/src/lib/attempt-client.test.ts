import { describe, expect, it, vi } from "vitest";
import { startNewAttempt, submitWithAttemptCapability } from "./attempt-client";

describe("attempt client handshake", () => {
  it("retries exactly once after the first-contact handshake", async () => {
    const call = vi.fn()
      .mockResolvedValueOnce({ status: "error", code: "attempt_required" })
      .mockResolvedValueOnce({ status: "error", code: "attempt_required" });
    expect(await submitWithAttemptCapability(call)).toEqual({ status: "error", code: "attempt_required" });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("never retries an expired capability automatically", async () => {
    const call = vi.fn().mockResolvedValue({ status: "error", code: "attempt_expired" });
    expect(await submitWithAttemptCapability(call)).toMatchObject({ code: "attempt_expired" });
    expect(call).toHaveBeenCalledOnce();
  });

  it("reports rotation success only when the server confirmed it, using no browser storage", async () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem, getItem: vi.fn(), removeItem: vi.fn() });
    expect(await startNewAttempt(async () => undefined)).toBe(true);
    expect(await startNewAttempt(async () => { throw new Error("network"); })).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
