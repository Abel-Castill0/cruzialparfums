import { expect, test } from "@playwright/test";

// Layout sanity across the viewport widths the release is checked at: no
// horizontal page overflow and the primary call to action stays reachable.

const WIDTHS = [360, 390, 430, 768, 1024, 1280, 1440];
const ROUTES = ["/parfums", "/parfums/catalogo", "/parfums/combos", "/parfums/mayorista", "/parfums/checkout", "/parfums/contacto", "/import", "/admin/login"];

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
