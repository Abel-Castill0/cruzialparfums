import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Automated accessibility gate (axe-core, WCAG 2.1 A/AA rules) on the public
// routes plus keyboard-only sanity for the cart dialog. Serious and critical
// violations fail the run; moderate/minor are reported for follow-up. The same
// pass fails on any uncaught page error or console error (hydration
// mismatches, CSP violations, runtime exceptions) on those routes.

const PUBLIC_ROUTES = [
  "/",
  "/parfums",
  "/parfums/catalogo",
  "/parfums/combos",
  "/parfums/checkout",
  "/parfums/contacto",
  "/parfums/privacidad",
  "/parfums/terminos",
  "/import",
  "/import/checkout",
  "/import/catalogo",
  "/libro-de-reclamaciones",
  "/admin/login",
];

for (const route of PUBLIC_ROUTES) {
  test(`axe: no serious/critical violations on ${route}`, async ({ page }, testInfo) => {
    // On a cold `.next/cache/images` the optimizer has to fetch and transcode every Cloudinary photo of the page
    // (38 on /parfums/combos); with three projects in parallel `networkidle` alone can pass 30s. Reproduced on
    // master (3/3 cold runs) and on the redesign, so it is test budget, not page behaviour.
    test.slow();
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      // TikTok logs these known policy/cookie notices from its cross-origin
      // player. The iframe is excluded from axe; our own runtime errors remain fatal.
      const externalEmbedNotice = /Permissions policy violation: accelerometer is not allowed|Content Security Policy directive 'upgrade-insecure-requests' is ignored when delivered in a report-only policy|@tiktok-fe\/web-cookie-banner init failed/.test(message.text());
      // The image optimizer answers 504 when its upstream (Cloudinary) fetch times out. On a cold
      // `.next/cache/images` with parallel workers that happens on master as well; it says nothing about the page.
      // Any other failed resource, and any 5xx that is not from /_next/image, stays fatal.
      const optimizerTimeout = /Failed to load resource: the server responded with a status of 50[34]/.test(message.text())
        && message.location().url.includes("/_next/image");
      if (optimizerTimeout) {
        testInfo.annotations.push({ type: "image-optimizer-5xx", description: message.location().url.slice(0, 120) });
      } else if (message.type() === "error" && !externalEmbedNotice) {
        runtimeErrors.push(`console: ${message.text()}`);
      }
    });
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    // Entrance transitions (Reveal, hero rise) start at opacity 0: scanning mid-fade reports contrast on
    // semi-transparent text that no user ever sees as final. Wait for every finite animation to settle.
    await page.evaluate(() => Promise.all(document.getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map((animation) => animation.finished.catch(() => undefined))));
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      // TikTok owns its iframe document; we separately assert our iframe title,
      // URL and CSP, while axe audits all first-party controls and content.
      .exclude("iframe")
      .analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    const advisory = results.violations.filter((v) => v.impact === "moderate" || v.impact === "minor");
    if (advisory.length) {
      testInfo.annotations.push({
        type: "a11y-advisory",
        description: advisory.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}`).join("; "),
      });
    }
    expect(blocking.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
    expect(runtimeErrors).toEqual([]);
  });
}

test("the 404 page is accessible and raises no runtime error beyond its own 404 status", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/status of 404/.test(message.text())) runtimeErrors.push(message.text());
  });
  const response = await page.goto("/parfums/productos/no-existe-este-producto-e2e");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test("keyboard: the cart dialog opens, traps focus, closes with Escape and restores focus", async ({ page }) => {
  await page.goto("/parfums/catalogo");
  const heroHeight = (await page.locator("[data-home-hero]").boundingBox())!.height;
  await page.evaluate((y) => window.scrollTo(0, y), heroHeight + 100);
  const trigger = page.getByRole("button", { name: /Abrir carrito/ });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.locator("[data-cart-drawer]");
  await expect(dialog).toHaveAttribute("aria-hidden", "false");
  await expect(dialog.locator("[data-autofocus]")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveAttribute("aria-hidden", "true");
  await expect(trigger).toBeFocused();
});

test("keyboard: product card 'Añadir' is reachable and announces the cart update", async ({ page }) => {
  await page.goto("/parfums/catalogo");
  const add = page.locator("[data-product-card]").first().getByRole("button", { name: /^Añadir/ });
  await add.focus();
  await expect(add).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /Abrir carrito, 1 producto/ })).toBeVisible();
});

// WCAG 2.5.3 Label in Name. axe ships this rule as experimental, so the tag-based
// runs above never evaluate it. Regression (2026-10-10): the footer brand link and
// the photo links of products without a photo had an aria-label that omitted their
// visible text.
for (const route of ["/parfums", "/parfums/catalogo", "/import", "/import/catalogo"]) {
  test(`axe: visible link/button text is part of the accessible name on ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).exclude("iframe").withRules(["label-content-name-mismatch"]).analyze();
    expect(
      results.violations.flatMap((v) => v.nodes.map((n) => n.target.join(" "))),
    ).toEqual([]);
  });
}
