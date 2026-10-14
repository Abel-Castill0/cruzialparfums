import { describe, expect, it } from "vitest";
import {
  clampSetsIndex,
  isSetsRotating,
  maxSetsIndex,
  nextSetsIndex,
  previousSetsIndex,
  SETS_ROTATION_MS,
  setsVisibleFor,
} from "./sets-carousel";

describe("sets carousel rules", () => {
  it("rotates every 4 seconds", () => {
    expect(SETS_ROTATION_MS).toBe(4000);
  });

  it("shows 3 sets on desktop, 2 on tablet and 1 on a phone", () => {
    expect(setsVisibleFor(1440)).toBe(3);
    expect(setsVisibleFor(1024)).toBe(3);
    expect(setsVisibleFor(1023)).toBe(2);
    expect(setsVisibleFor(768)).toBe(2);
    expect(setsVisibleFor(640)).toBe(2);
    expect(setsVisibleFor(639)).toBe(1);
    expect(setsVisibleFor(390)).toBe(1);
  });

  it("the window starts at 0 up to total minus visible", () => {
    expect(maxSetsIndex(5, 3)).toBe(2);
    expect(maxSetsIndex(3, 3)).toBe(0);
    expect(maxSetsIndex(2, 3)).toBe(0);
  });

  it("moves one set at a time and returns to the start after the last window", () => {
    expect(nextSetsIndex(0, 5, 3)).toBe(1);
    expect(nextSetsIndex(1, 5, 3)).toBe(2);
    expect(nextSetsIndex(2, 5, 3)).toBe(0);
  });

  it("goes back one set and wraps to the last window", () => {
    expect(previousSetsIndex(2, 5, 3)).toBe(1);
    expect(previousSetsIndex(0, 5, 3)).toBe(2);
  });

  it("clamps the position when fewer sets fit than before", () => {
    expect(clampSetsIndex(4, 5, 1)).toBe(4);
    expect(clampSetsIndex(4, 5, 3)).toBe(2);
    expect(clampSetsIndex(-1, 5, 3)).toBe(0);
  });

  describe("isSetsRotating", () => {
    const base = { total: 5, visible: 3, reducedMotion: false, stopped: false, holding: false };

    it("rotates when some sets are out of view", () => {
      expect(isSetsRotating(base)).toBe(true);
    });

    it("stays still when everything is already in view", () => {
      expect(isSetsRotating({ ...base, total: 3 })).toBe(false);
      expect(isSetsRotating({ ...base, total: 2 })).toBe(false);
    });

    it("never moves under reduced motion, after the visitor takes over, or while held", () => {
      expect(isSetsRotating({ ...base, reducedMotion: true })).toBe(false);
      expect(isSetsRotating({ ...base, stopped: true })).toBe(false);
      expect(isSetsRotating({ ...base, holding: true })).toBe(false);
    });
  });
});
