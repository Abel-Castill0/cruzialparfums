import { describe, expect, it } from "vitest";
import { resolveIndexingPolicy } from "./indexing-policy";

describe("indexing policy", () => {
  it.each(["development", "preview"] as const)(
    "keeps %s deployments out of the index",
    (deploymentEnvironment) => {
      expect(
        resolveIndexingPolicy({ deploymentEnvironment, cutoverApproved: true }),
      ).toEqual({ index: false, follow: false });
    },
  );

  it("requires an explicit production cutover approval", () => {
    expect(
      resolveIndexingPolicy({
        deploymentEnvironment: "production",
        cutoverApproved: false,
      }),
    ).toEqual({ index: false, follow: false });
    expect(
      resolveIndexingPolicy({
        deploymentEnvironment: "production",
        cutoverApproved: true,
      }),
    ).toEqual({ index: true, follow: true });
  });
});
