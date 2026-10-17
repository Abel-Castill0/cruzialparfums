import { describe, expect, it } from "vitest";
import { CLOSED_LIGHTBOX, lightboxActionForKey, lightboxReducer } from "./lightbox-state";

describe("lightbox keyboard state", () => {
  it("opens at the selected photo", () => {
    expect(lightboxReducer(CLOSED_LIGHTBOX, { type: "open", index: 2 }, 5)).toEqual({ activeIndex: 2 });
  });

  it("maps Escape and arrow keys to close and navigation actions", () => {
    expect(lightboxActionForKey("Escape")).toBe("close");
    expect(lightboxActionForKey("ArrowLeft")).toBe("previous");
    expect(lightboxActionForKey("ArrowRight")).toBe("next");
    expect(lightboxActionForKey("Tab")).toBeNull();
  });

  it("closes on Escape and wraps arrow navigation in both directions", () => {
    const last = lightboxReducer({ activeIndex: 4 }, { type: "next" }, 5);
    expect(last).toEqual({ activeIndex: 0 });
    const previous = lightboxReducer(last, { type: "previous" }, 5);
    expect(previous).toEqual({ activeIndex: 4 });
    expect(lightboxReducer(previous, { type: "close" }, 5)).toEqual({ activeIndex: null });
  });
});
