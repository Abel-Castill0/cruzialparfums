import { describe, expect, it } from "vitest";
import { mayServeLegacyFixture } from "./legacy-fixture-policy";

describe("legacy fixture policy", () => {
  it("allows the fixture on a local checkout without a deployment platform", () => {
    expect(mayServeLegacyFixture({})).toBe(true);
    expect(mayServeLegacyFixture({ VERCEL: "" })).toBe(true);
  });

  it("never serves unverified legacy prices from a Vercel deployment", () => {
    expect(mayServeLegacyFixture({ VERCEL: "1" })).toBe(false);
  });
});
