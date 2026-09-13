import { expect, test } from "@playwright/test";

// Test 3 — Import public critical journey.
// Import's public surface depends on live campaign/catalog state, which this
// suite must not assume:
//   - closed: no open consolidado (#import-closed-title)
//   - open + products: discovery -> add to cart -> cart -> checkout boundary
//   - open + empty catalog: campaign is open but no products match the
//     default filters (#campaign-title present, catalog list empty)
// All three are real, current possibilities on staging, detected via
// semantic ids/copy already in the shipped markup (no test-only attributes
// needed). None of the branches submit the checkout form — submission
// persists a real order request, which must never happen against staging
// data in this gate.

test("import: catalog discovery to checkout boundary, or documented current state", async ({ page }) => {
  await page.goto("/import");

  const closedHeading = page.locator("#import-closed-title");
  const campaignHeading = page.locator("#campaign-title");
  await expect(closedHeading.or(campaignHeading).first()).toBeVisible();

  if (await closedHeading.isVisible()) {
    test.info().annotations.push({
      type: "note",
      description: "Import has no open consolidado on this target; verified closed-state surface only.",
    });
    return;
  }

  await expect(campaignHeading).toBeVisible();

  const addButton = page.getByRole("button", { name: "Agregar al carrito" }).first();
  const emptyState = page.getByText("No encontramos productos con estos filtros.");

  if (!(await addButton.isVisible().catch(() => false))) {
    await expect(emptyState).toBeVisible();
    test.info().annotations.push({
      type: "note",
      description: "Import campaign is open but its catalog currently has no products matching the default filters; verified campaign + empty-catalog surface only.",
    });
    return;
  }

  await addButton.click();

  await page.goto("/import/carrito");
  await expect(page.getByRole("list", { name: "Productos en el carrito" })).toBeVisible();

  await page.getByRole("link", { name: "Continuar al checkout" }).click();
  await expect(page).toHaveURL(/\/import\/checkout/);
  // Checkout renders its form phase without submitting it.
  await expect(page.locator("form").first()).toBeVisible();
});
