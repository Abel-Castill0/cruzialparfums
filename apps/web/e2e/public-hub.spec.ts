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

// Regression (2026-10-10): the Parfums home rendered "Cruzial Parfums — Cruzial
// Parfums", the Import home lost its unit brand, and the Import cart/checkout
// (client pages without metadata) both rendered "Cruzial Import — Cruzial".
test("unit pages have distinct, branded titles without a repeated brand", async ({ page }) => {
  const expected: Array<[string, RegExp]> = [
    ["/parfums", /^Cruzial Parfums — /],
    ["/import", /\| Cruzial Import$/],
    ["/import/carrito", /^Carrito \| Cruzial Import$/],
    ["/import/checkout", /^Solicitud de pedido \| Cruzial Import$/],
  ];
  for (const [path, pattern] of expected) {
    await page.goto(path);
    const title = await page.title();
    expect(title, path).toMatch(pattern);
    expect(title.match(/Cruzial (Parfums|Import)/g)?.length ?? 0, path).toBe(1);
  }
});
