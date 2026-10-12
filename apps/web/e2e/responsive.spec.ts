import { expect, test } from "@playwright/test";

// Layout sanity across the viewport widths the release is checked at: no
// horizontal page overflow and the primary call to action stays reachable.

const WIDTHS = [320, 360, 390, 430, 768, 1024, 1280, 1440];
const ROUTES = ["/parfums", "/parfums/catalogo", "/parfums/combos", "/parfums/checkout", "/parfums/contacto", "/import", "/import/catalogo", "/admin/login"];

test.describe("responsive layout", () => {
  for (const width of WIDTHS) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ROUTES) {
        await page.goto(route);
        const overflow = await page.evaluate(() => {
          const doc = document.documentElement;
          const offenders = [...document.querySelectorAll("body *")]
            .filter((el) => {
              const rect = el.getBoundingClientRect();
              const style = getComputedStyle(el);
              return rect.right > doc.clientWidth + 1 && style.position !== "fixed" && style.visibility !== "hidden";
            })
            .slice(0, 3)
            .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}`);
          return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, offenders };
        });
        expect(overflow.scrollWidth, `${route} @${width}: ${overflow.offenders.join(", ")}`).toBeLessThanOrEqual(overflow.clientWidth);
      }
    });
  }

  // The search kept a 320px flex-basis and no min-width: 0, so on a phone the bar outgrew its container and the Filtros
  // button was clipped by the viewport edge (the page itself never scrolled, so the overflow test above did not notice).
  for (const width of [320, 375, 390]) {
    test(`catalog Filtros button is fully inside the viewport at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/parfums/catalogo");
      const button = page.getByRole("button", { name: /Filtros/ }).first();
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x + box!.width, "right edge inside the 16px gutter").toBeLessThanOrEqual(width - 16 + 1);
    });
  }

  test("footer Instagram link is the Instagram glyph, not the letters IG", async ({ page }) => {
    await page.goto("/parfums");
    const link = page.locator("footer").getByRole("link", { name: "Instagram", exact: true });
    await expect(link.locator("svg")).toHaveCount(1);
    await expect(link).not.toHaveText(/IG/);
  });

  test("product page keeps the add-to-cart control inside the viewport on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/parfums/catalogo");
    const href = await page.locator("[data-product-card] a[href^='/parfums/productos/']").first().getAttribute("href");
    await page.goto(href!);
    const button = page.getByRole("button", { name: /Añadir al carrito/ });
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    expect(box!.height).toBeGreaterThanOrEqual(40);
  });
});
