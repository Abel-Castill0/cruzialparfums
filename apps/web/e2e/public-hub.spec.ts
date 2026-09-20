import { expect, test } from "@playwright/test";

// Test 1 — Public hub/navigation.
// Verifies the gateway page loads and exposes both business units, and that
// navigating into each does not error.

test("public hub exposes Parfums and Import and both load", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBeTruthy();

  const parfumsLink = page.locator('[data-unit="parfums"]');
  const importLink = page.locator('[data-unit="import"]');
  await expect(parfumsLink).toBeVisible();
  await expect(importLink).toBeVisible();

  const parfumsResponse = await page.goto("/parfums");
  expect(parfumsResponse?.ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/parfums$/);

  const importResponse = await page.goto("/import");
  expect(importResponse?.ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/import$/);
});
