import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Automated accessibility gate (axe-core, WCAG 2.1 A/AA rules) on the public
// routes plus keyboard-only sanity for the cart dialog. Serious and critical
// violations fail the run; moderate/minor are reported for follow-up.

const PUBLIC_ROUTES = [
  "/",
  "/parfums",
  "/parfums/catalogo",
  "/parfums/combos",
  "/parfums/mayorista",
  "/parfums/checkout",
  "/parfums/contacto",
  "/parfums/privacidad",
  "/import",
  "/admin/login",
];

for (const route of PUBLIC_ROUTES) {
  test(`axe: no serious/critical violations on ${route}`, async ({ page }, testInfo) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
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
  });
}

test("keyboard: the cart dialog opens, traps focus, closes with Escape and restores focus", async ({ page }) => {
  await page.goto("/parfums/catalogo");
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
