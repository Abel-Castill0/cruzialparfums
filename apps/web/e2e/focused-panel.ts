import { expect, type Locator } from "@playwright/test";

/** A focused outcome must be in view and below any sticky shell header. */
export async function expectActionablePanelFocus(panel: Locator) {
  await expect(panel).toBeFocused();
  await expect.poll(() => panel.evaluate((element) => {
    const top = element.getBoundingClientRect().top;
    const headerBottom = Array.from(document.querySelectorAll("header")).reduce((bottom, header) => {
      const position = getComputedStyle(header).position;
      const rect = header.getBoundingClientRect();
      return (position === "sticky" || position === "fixed") && rect.top >= 0
        ? Math.max(bottom, rect.bottom) : bottom;
    }, 0);
    return top >= headerBottom - 1 && top < innerHeight;
  })).toBe(true);
}
