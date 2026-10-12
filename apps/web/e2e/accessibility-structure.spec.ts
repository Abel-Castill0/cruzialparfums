import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Document structure gate for the storefront: WCAG 2.4.1 Bypass Blocks (skip link) and 1.3.1 Info and
// Relationships (one h1, heading levels that never skip, product lists exposed as lists).

const STOREFRONT_ROUTES = [
  "/",
  "/parfums",
  "/parfums/catalogo",
  "/parfums/combos",
  "/parfums/contacto",
  "/parfums/privacidad",
  "/parfums/terminos",
  "/import",
  "/import/catalogo",
];

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
    .map((animation) => animation.finished.catch(() => undefined))));
}

function renderedHeadingLevels(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, [role=heading]")]
      .filter((heading) => heading.checkVisibility({ visibilityProperty: true }) && !heading.closest("[aria-hidden=true]"))
      .map((heading) => ({
        level: heading.getAttribute("aria-level") ? Number(heading.getAttribute("aria-level")) : Number(heading.tagName.slice(1)),
        text: (heading.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60),
      })));
}

for (const route of STOREFRONT_ROUTES) {
  test.describe(`structure ${route}`, () => {
    test("one h1 and no skipped heading levels", async ({ page }) => {
      test.slow();
      await page.goto(route);
      await settle(page);
      const headings = await renderedHeadingLevels(page);
      expect(headings.filter(({ level }) => level === 1), "exactly one h1").toHaveLength(1);
      expect(headings[0]?.level, "the first heading is the h1").toBe(1);
      const jumps = headings.flatMap((heading, index) => {
        const previous = headings[index - 1];
        return previous && heading.level > previous.level + 1 ? [`h${previous.level} "${previous.text}" -> h${heading.level} "${heading.text}"`] : [];
      });
      expect(jumps, "heading levels may rise by one at a time").toEqual([]);
    });

    test("skip link is the first tab stop, hidden until focused, and moves focus to <main>", async ({ page }) => {
      test.slow();
      await page.goto(route);
      await settle(page);
      const skip = page.getByRole("link", { name: "Saltar al contenido" });
      await expect(skip).toHaveCount(1);
      await expect(skip, "off-screen until focused").not.toBeInViewport();

      await page.keyboard.press("Tab");
      await expect(skip, "first Tab lands on the skip link").toBeFocused();
      await expect(skip).toBeInViewport({ ratio: 1 });
      const box = await skip.boundingBox();
      expect(Math.round(box?.height ?? 0), "44px touch target").toBeGreaterThanOrEqual(44);

      await page.keyboard.press("Enter");
      const focused = await page.evaluate(() => ({ tag: document.activeElement?.tagName, id: document.activeElement?.id }));
      expect(focused.tag).toBe("MAIN");
      expect(focused.id).toBe("contenido-principal");
      // The next Tab continues from inside <main>, not from the header the link skipped.
      await page.keyboard.press("Tab");
      const insideMain = await page.evaluate(() => document.activeElement?.closest("main") !== null);
      expect(insideMain, "focus continues inside <main>").toBe(true);
    });
  });
}

test.describe("catalog semantics", () => {
  test("/parfums/catalogo: h2 section, one article + h3 per product, in a list", async ({ page }) => {
    test.slow();
    await page.goto("/parfums/catalogo");
    await settle(page);
    const section = page.getByRole("region", { name: "Catálogo de perfumes" });
    await expect(section.getByRole("heading", { level: 2, name: "Catálogo de perfumes" })).toHaveCount(1);

    const grid = page.locator("[data-product-grid]");
    await expect(grid).toHaveAttribute("role", "list");
    expect(await grid.evaluate((element) => element.tagName)).toBe("UL");
    const items = grid.locator(":scope > li");
    const count = await items.count();
    expect(count).toBeGreaterThan(1);
    await expect(grid.locator("article")).toHaveCount(count);
    await expect(grid.locator("article > * h3, article h3")).toHaveCount(count);
    await expect(grid.getByRole("heading", { level: 2 }), "no product name is an h2").toHaveCount(0);
    // Screen-reader list navigation announces the count.
    await expect(page.getByRole("list").filter({ has: page.locator("article") }).first().getByRole("listitem")).toHaveCount(count);
  });

  test("product detail: related products are h3 under the h2", async ({ page }) => {
    test.slow();
    await page.goto("/parfums/catalogo");
    await settle(page);
    const href = await page.locator("[data-product-grid] article a[href^='/parfums/productos/']").first().getAttribute("href");
    expect(href).toBeTruthy();
    await page.goto(href ?? "/parfums/catalogo");
    await settle(page);
    const headings = await renderedHeadingLevels(page);
    expect(headings.filter(({ level }) => level === 1)).toHaveLength(1);
    const jumps = headings.flatMap((heading, index) => {
      const previous = headings[index - 1];
      return previous && heading.level > previous.level + 1 ? [`${previous.level}->${heading.level} ${heading.text}`] : [];
    });
    expect(jumps).toEqual([]);
  });
});

for (const route of ["/parfums/catalogo", "/import"]) {
  test(`axe (WCAG 2.2 A/AA) on ${route}: structure rules clean`, async ({ page }) => {
    test.slow();
    await page.goto(route);
    await settle(page);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .exclude("iframe")
      .analyze();
    const structural = results.violations.filter(({ id }) =>
      ["bypass", "heading-order", "page-has-heading-one", "list", "listitem", "landmark-one-main", "empty-heading", "duplicate-id"].includes(id));
    expect(structural.map(({ id, nodes }) => `${id}: ${nodes.map((node) => node.target.join(" ")).join(" | ")}`)).toEqual([]);
    // `region` (best practice) also flags the pre-existing floating WhatsApp button and announcement-bar control;
    // what this gate owns is that the skip link itself is never reported as content outside a landmark.
    const orphaned = results.violations.filter(({ id }) => id === "region").flatMap(({ nodes }) => nodes.map((node) => node.target.join(" ")));
    expect(orphaned.filter((target) => target.includes("skipLink"))).toEqual([]);
    const blocking = results.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
    expect(blocking.map(({ id }) => id)).toEqual([]);
  });
}
