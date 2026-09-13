import { expect, test } from "@playwright/test";

// Test 2 — Parfums public critical journey.
// Home -> catalog discovery -> add first eligible product -> checkout with a
// populated cart. Stops short of submitting the checkout form: submission
// calls a server action that persists an order request and stages a
// WhatsApp handoff, which this gate must not trigger against real/staging
// data. The generated checkout state (cart lines + total) is verified
// structurally instead, which is what would seed the WhatsApp intent.

test("parfums: catalog discovery to checkout with populated cart", async ({ page }) => {
  await page.goto("/parfums");
  await page.getByRole("link", { name: "Explorar catálogo" }).first().click();
  await expect(page).toHaveURL(/\/parfums\/catalogo/);

  const grid = page.locator("[data-product-grid]");
  await expect(grid).toBeVisible();

  // First purchasable card: one that exposes an "Añadir" action (discontinued
  // cards render without it), independent of any specific client product.
  const purchasableCard = page
    .locator("[data-product-card]")
    .filter({ has: page.getByRole("button", { name: /^Añadir/ }) })
    .first();
  await expect(purchasableCard).toBeVisible();
  await purchasableCard.getByRole("button", { name: /^Añadir/ }).click();

  await page.goto("/parfums/checkout");
  await expect(page.locator("[data-checkout-form-panel]")).toBeVisible();

  const total = page.locator("[data-checkout-total]");
  await expect(total).toBeVisible();
  await expect(total).not.toHaveText("S/ 0.00");

  const submit = page.locator("[data-checkout-submit]");
  await expect(submit).toBeEnabled();
});
