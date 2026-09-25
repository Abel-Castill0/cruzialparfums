import { describe, expect, it } from "vitest";
import { isOrderAgeBucket, orderAgeRange } from "./order-age";

describe("isOrderAgeBucket", () => {
  it("accepts the three known buckets", () => {
    expect(isOrderAgeBucket("today")).toBe(true);
    expect(isOrderAgeBucket("recent")).toBe(true);
    expect(isOrderAgeBucket("old")).toBe(true);
  });

  it("rejects anything else, including an invented SLA-style value", () => {
    expect(isOrderAgeBucket("")).toBe(false);
    expect(isOrderAgeBucket("late")).toBe(false);
    expect(isOrderAgeBucket(undefined)).toBe(false);
    expect(isOrderAgeBucket(3)).toBe(false);
  });
});

describe("orderAgeRange", () => {
  it("today has a lower bound and no upper bound", () => {
    const range = orderAgeRange("today");
    expect(range.gte).toBeDefined();
    expect(range.lt).toBeUndefined();
  });

  it("recent (1-2 days) is bounded on both sides, ending where today starts", () => {
    const today = orderAgeRange("today");
    const recent = orderAgeRange("recent");
    expect(recent.gte).toBeDefined();
    expect(recent.lt).toBe(today.gte);
    expect(new Date(recent.gte!).getTime()).toBeLessThan(new Date(recent.lt!).getTime());
  });

  it("old (3+ days) has only an upper bound, matching where recent starts", () => {
    const recent = orderAgeRange("recent");
    const old = orderAgeRange("old");
    expect(old.gte).toBeUndefined();
    expect(old.lt).toBe(recent.gte);
  });
});
