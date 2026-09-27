import { describe, expect, it } from "vitest";
import {
  ATTEMPT_TTL_SECONDS,
  deriveAttemptRequestId,
  mintAttemptToken,
  parseAttemptToken,
} from "./attempt-token";

const NOW = 1_800_000_000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function parsed(token: string) {
  const result = parseAttemptToken(token, NOW);
  if (!result.ok) throw new Error(`expected a valid token, got ${result.reason}`);
  return result;
}

describe("anonymous attempt token", () => {
  it("mints a versioned 256-bit nonce that parses back", () => {
    const token = mintAttemptToken(NOW);
    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]{43}\.1800000000$/);
    expect(parsed(token).issuedAt).toBe(NOW);
    expect(mintAttemptToken(NOW)).not.toBe(token);
  });

  it.each([
    ["missing", undefined],
    ["malformed", "garbage"],
    ["malformed", "v2.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.1800000000"],
    ["malformed", "v1.short.1800000000"],
    ["malformed", `v1.${"A".repeat(43)}.${NOW + 3600}`],
    ["expired", `v1.${"A".repeat(43)}.${NOW - ATTEMPT_TTL_SECONDS - 1}`],
  ] as const)("rejects a %s token", (reason, value) => {
    expect(parseAttemptToken(value, NOW)).toEqual({ ok: false, reason });
  });

  it("derives a deterministic v4-shaped id per (flow, scope, token)", () => {
    const token = parsed(mintAttemptToken(NOW));
    const id = deriveAttemptRequestId("parfums-order", "parfums", token);
    expect(id).toMatch(UUID_V4);
    expect(deriveAttemptRequestId("parfums-order", "parfums", token)).toBe(id);
  });

  it("domain-separates flows and scopes: one token never addresses another flow's attempt", () => {
    const token = parsed(mintAttemptToken(NOW));
    const ids = new Set([
      deriveAttemptRequestId("parfums-order", "parfums", token),
      deriveAttemptRequestId("import-order", "import", token),
      deriveAttemptRequestId("complaint", "parfums", token),
      deriveAttemptRequestId("complaint", "import", token),
    ]);
    expect(ids.size).toBe(4);
  });

  it("binds issuedAt into the id, so editing it to dodge expiry changes the attempt", () => {
    const token = parsed(mintAttemptToken(NOW));
    expect(deriveAttemptRequestId("parfums-order", "parfums", { ...token, issuedAt: NOW + 1 }))
      .not.toBe(deriveAttemptRequestId("parfums-order", "parfums", token));
  });
});
