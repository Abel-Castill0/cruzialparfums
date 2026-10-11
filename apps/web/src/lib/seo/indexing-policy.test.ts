import { describe, expect, it } from "vitest";
import { resolveIndexingPolicy } from "./indexing-policy";

describe("indexing policy", () => {
  it.each(["development", "preview"] as const)("keeps %s deployments out of the index even when the owner enabled it", (deploymentEnvironment) => {
    expect(resolveIndexingPolicy({ deploymentEnvironment, ownerEnabled: true })).toEqual({ index: false, follow: false });
  });

  it("on production follows the owner's switch", () => {
    expect(resolveIndexingPolicy({ deploymentEnvironment: "production", ownerEnabled: false })).toEqual({ index: false, follow: false });
    expect(resolveIndexingPolicy({ deploymentEnvironment: "production", ownerEnabled: true })).toEqual({ index: true, follow: true });
  });

  it("the emergency override closes production regardless of the switch", () => {
    expect(resolveIndexingPolicy({ deploymentEnvironment: "production", ownerEnabled: true, forceOff: true })).toEqual({ index: false, follow: false });
  });
});
