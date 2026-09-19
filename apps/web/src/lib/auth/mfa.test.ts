import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { findOwnFactor, type TotpFactor } from "./mfa";

const factors: TotpFactor[] = [
  { id: "verified-1", friendlyName: "Phone", status: "verified" },
  { id: "unverified-1", friendlyName: null, status: "unverified" },
];

describe("findOwnFactor", () => {
  it("finds a factor by id when the status matches", () => {
    expect(findOwnFactor(factors, "verified-1", "verified")).toEqual(factors[0]);
  });

  it("rejects a factor whose status does not match (unverified id, verified expected)", () => {
    expect(findOwnFactor(factors, "unverified-1", "verified")).toBeNull();
  });

  it("rejects a factor whose status does not match (verified id, unverified expected)", () => {
    expect(findOwnFactor(factors, "verified-1", "unverified")).toBeNull();
  });

  it("rejects a factorId that is not in the caller's own list at all", () => {
    // This is the case that matters: a browser-supplied factorId belonging
    // to someone else, or one that never existed, must never resolve.
    expect(findOwnFactor(factors, "someone-elses-factor", "verified")).toBeNull();
  });

  it("returns null against an empty factor list", () => {
    expect(findOwnFactor([], "verified-1", "verified")).toBeNull();
  });
});
