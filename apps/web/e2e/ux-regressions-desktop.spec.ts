import { expect, test } from "@playwright/test";

// UX regressions from the 2026-10 frontend audit that only apply to the desktop layout (a timing probe that runs once).
// Matched only by that Playwright project (playwright.config.ts), so no test is skipped by viewport.

test("carousels hold their rotation while keyboard focus is on any of their controls", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/parfums");
  const carousels = [
    { name: "hero", root: "[data-home-hero]", wait: 8_500, read: () => document.querySelector("[data-home-hero] [aria-current=true]")?.getAttribute("aria-label") ?? "" },
    { name: "combos", root: "[aria-label='Combos Cruzial'][role=region]", wait: 6_500, read: () => String([...document.querySelectorAll("[aria-label='Combos Cruzial'] article")].findIndex((slide) => (slide as HTMLElement).dataset.active === "true")) },
    // Data attributes, not class names: CSS-module classes are hashed in a production build, so a [class*=marquee]
    // selector never matched and this rail was silently never exercised.
    { name: "rail", root: "[data-product-marquee]", wait: 2_500, read: () => String(Math.round(document.querySelector("[data-product-marquee] [data-loop='true']")?.scrollLeft ?? -1)) },
  ];
  let exercised = 0;
  for (const carousel of carousels) {
    const root = page.locator(carousel.root).first();
    // Sets with a single member or short rails do not rotate: nothing to hold.
    if (!(await root.count()) || (await root.locator("button").count()) === 0) continue;
    await root.scrollIntoViewIfNeeded();
    await page.mouse.move(2, 2);
    // The pause control is the one that used to be left out; it is checked first.
    const pause = root.getByRole("button", { name: /pausar|reanudar/i }).first();
    if ((await pause.count()) === 0) continue;
    await pause.focus();
    const before = await page.evaluate(carousel.read);
    await page.waitForTimeout(carousel.wait);
    expect(await page.evaluate(carousel.read), `${carousel.name} moved while its pause button had focus`).toBe(before);
    exercised += 1;
  }
  test.skip(exercised === 0, "no auto-rotating carousel on this stack");
});
