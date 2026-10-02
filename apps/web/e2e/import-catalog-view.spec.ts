import { expect, test } from "@playwright/test";

test("Import catalog opens as a separate view and its home hero owns the first screen", async ({ page }) => {
  await page.goto("/import");

  const header = page.locator("header").first();
  const catalogNav = page.locator('nav[aria-label="Navegación de Cruzial Import"] a').filter({ hasText: "Catálogo" });
  await expect(catalogNav).toHaveAttribute("href", "/import/catalogo");
  await expect(header).toHaveCSS("visibility", "hidden");

  const hero = page.locator("[data-import-home-hero]");
  const heroBox = await hero.boundingBox();
  const viewport = page.viewportSize();
  expect(heroBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(heroBox!.height).toBeGreaterThanOrEqual(viewport!.height - 2);

  // The link target is asserted above; navigate directly here so this test is
  // independent of whichever campaign database is available to the runner.
  await page.goto("/import/catalogo");
  await expect(page).toHaveURL(/\/import\/catalogo$/);
  await expect(page.getByRole("heading", { level: 1, name: "Catálogo del consolidado" })).toBeVisible();
  await expect(header).toHaveCSS("visibility", "visible");
});

test("Parfums catalog has exactly three discovery categories and hides the header again at the hero", async ({ page }) => {
  await page.goto("/parfums/catalogo");
  const hero = page.locator("[data-home-hero]");
  const header = page.locator("header").first();

  await expect(hero).toBeVisible();
  await expect(header).toHaveCSS("visibility", "hidden");
  await expect(page.locator('nav[aria-label="Explorar por categoría"] li')).toHaveCount(3);

  const heroHeight = (await hero.boundingBox())!.height;
  await page.evaluate((height) => window.scrollTo(0, height + 100), heroHeight);
  await expect(header).toHaveCSS("visibility", "visible");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(header).toHaveCSS("visibility", "hidden");

  await page.goto("/parfums");
  const homeHero = page.locator("[data-home-hero]");
  const homeHeroHeight = (await homeHero.boundingBox())!.height;
  await page.evaluate((height) => window.scrollTo(0, height + 100), homeHeroHeight);
  await expect(header).toHaveCSS("visibility", "visible");
  await page.getByRole("link", { name: "Catálogo" }).first().click();
  await expect(page).toHaveURL(/\/parfums\/catalogo/);
  await expect(header).toHaveCSS("visibility", "hidden");
});

test("each home exposes its configured TikTok player through the allowed frame origin", async ({ page }) => {
  const parfumsResponse = await page.goto("/parfums");
  const parfumsPlayer = page.locator('iframe[title="Cada detalle cuenta"]');
  await expect(parfumsPlayer).toHaveAttribute("src", /^https:\/\/www\.tiktok\.com\/player\/v1\/7683916686390496533\?/);
  expect(parfumsResponse?.headers()["content-security-policy"]).toContain("frame-src 'self' https://www.tiktok.com");

  const importResponse = await page.goto("/import");
  const importVideo = page.locator('[data-home-video="import"]');
  await expect(importVideo.locator("iframe")).toHaveCount(0);
  await importVideo.getByRole("button", { name: /Reproducir video/ }).click();
  const importPlayer = importVideo.locator('iframe[title="Tercer consolidado de perfumería"]');
  await expect(importPlayer).toHaveAttribute("src", /^https:\/\/www\.tiktok\.com\/player\/v1\/7657015388252720402\?/);
  expect(importResponse?.headers()["content-security-policy"]).toContain("frame-src 'self' https://www.tiktok.com");
});
