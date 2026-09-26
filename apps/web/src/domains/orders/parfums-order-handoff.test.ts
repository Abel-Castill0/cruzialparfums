import { describe, expect, it } from "vitest";
import { shouldClearCartAfterOrder } from "./parfums-order-handoff";

describe("Parfums checkout handoff", () => {
  it("clears the cart only after persistence succeeds", () => {
    expect(shouldClearCartAfterOrder("success")).toBe(true);
    expect(shouldClearCartAfterOrder("error")).toBe(false);
  });
});
