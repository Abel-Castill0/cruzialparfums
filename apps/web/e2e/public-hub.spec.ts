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

// Regression (2026-10-11): Next 16 streamed async metadata into <body> for browser user agents, so `/` and `/parfums`
// had no <meta name="description"> inside <head> (Lighthouse meta-description failed). next.config.ts sets
// htmlLimitedBots: /.*/ so metadata blocks and lands in <head> for every user agent.
test("title, description and robots are inside <head> for a browser user agent", async ({ request }) => {
  for (const path of ["/", "/parfums", "/import", "/parfums/catalogo"]) {
    const response = await request.get(path, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36" } });
    expect(response.ok(), path).toBeTruthy();
    const html = await response.text();
    const headEnd = html.indexOf("</head>");
    expect(headEnd, `${path} has a <head>`).toBeGreaterThan(0);
    const head = html.slice(0, headEnd);
    expect(head, `${path} <title> in head`).toMatch(/<title>[^<]+<\/title>/);
    expect(head, `${path} description in head`).toMatch(/<meta name="description" content="[^"]+"/);
    expect(head, `${path} robots in head`).toMatch(/<meta name="robots"/);
  }
});
