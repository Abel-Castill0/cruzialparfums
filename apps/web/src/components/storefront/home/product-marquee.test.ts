import { describe, expect, it } from "vitest";
import { MARQUEE_DRIFT_PX_PER_SECOND } from "./product-marquee";

describe("product marquee", () => {
  it("drifts at 40 px/s (a code-level setting, not an admin option)", () => {
    expect(MARQUEE_DRIFT_PX_PER_SECOND).toBe(40);
  });
});
