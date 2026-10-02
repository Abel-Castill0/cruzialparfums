import { expect, test, type Page } from "@playwright/test";

// Parfums shell and home behaviour: hero + header, the search dialog, the
// recommender (finder) open/close/complete flow, the cart drawer layering, and
// the Import TikTok module. Read-only: it never submits an order.

async function firstPurchasableCardAdd(page: Page) {
  await page.goto("/parfums/catalogo");
  const card = page
    .locator("[data-product-card]")
    .filter({ has: page.getByRole("button", { name: /^Añadir/ }) })
    .first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /^Añadir/ }).click();
}

test.describe("parfums home hero and header", () => {
  test("the hero owns the first screen with no text on it; the header appears after it", async ({ page }) => {
    await page.goto("/parfums");
    const hero = page.locator("[data-home-hero]");
    await expect(hero).toBeVisible();
    await expect(hero.locator('[aria-roledescription="slide"]')).toHaveCount(4);
    for (const image of ["hero-crop.webp", "promo-cuarteto.webp", "promo-vainilla.webp", "promo-tulum.webp"]) {
      await expect(hero.locator(`[aria-roledescription="slide"] img[src*="${image}"]`)).toHaveCount(1);
    }

    const viewport = page.viewportSize()!;
    const box = (await hero.boundingBox())!;
    expect(box.height).toBeGreaterThan(viewport.height * 0.8);
    // Artwork only: no headline or paragraph sits on the image.
    await expect(hero.locator("h1, h2, h3, p")).toHaveCount(0);

    const header = page.locator("header").first();
    await expect(header).toBeHidden();

    await page.evaluate(() => window.scrollTo(0, window.innerHeight + 300));
    await expect(header).toBeVisible();
  });

  test("the hero menu button brings the navigation in and focuses it", async ({ page }) => {
    await page.goto("/parfums");
    await page.getByRole("button", { name: "Mostrar navegación" }).click();
    await expect(page.locator("header").first()).toBeVisible();
    await expect(page.locator("header a:focus")).toHaveCount(1);
  });

  test("other Parfums pages keep an always-visible header", async ({ page }) => {
    await page.goto("/parfums/catalogo");
    await expect(page.locator("header").first()).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 1200));
    await expect(page.locator("header").first()).toBeVisible();
  });
});

test.describe("parfums search", () => {
  test("opens over the whole viewport, takes focus and typing, finds products and closes with Escape", async ({ page }) => {
    await page.goto("/parfums/catalogo");
    await page.evaluate(() => window.scrollTo(0, 400));
    const trigger = page.getByRole("button", { name: "Buscar fragancias" }).first();
    await trigger.click();

    const panel = page.getByRole("dialog", { name: "Buscar fragancias" });
    await expect(panel).toBeVisible();
    const viewport = page.viewportSize()!;
    const box = (await panel.boundingBox())!;
    // Regression: a backdrop-filter on the header used to squash the dialog
    // to the header's height.
    expect(box.height).toBeGreaterThanOrEqual(viewport.height - 1);

    const input = panel.getByRole("searchbox");
    await expect(input).toBeFocused();
    await page.keyboard.type("zzzzzz");
    await expect(panel.getByText(/No encontramos coincidencias/)).toBeVisible();

    await input.fill("a");
    await expect(panel.locator("[data-search-result]").first()).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test.describe("parfums recommender", () => {
  test("closing returns to the same page and position; completing hands over to the catalog", async ({ page }) => {
    await page.goto("/parfums/catalogo?type=arab");
    const opener = page.getByRole("link", { name: /Encontrar mi fragancia/ }).first();
    await opener.focus();
    await page.evaluate(() => window.scrollTo(0, 700));
    const before = await page.evaluate(() => window.scrollY);

    // Escape, the X and a click outside all go back where the visitor was.
    for (const close of [
      () => page.keyboard.press("Escape"),
      () => page.getByRole("button", { name: "Cerrar buscador de fragancias" }).last().click(),
      // Click outside: only where the panel leaves an outside (on a phone it
      // fills the screen, so there is nothing to click).
      async () => {
        const panelBox = await page.locator("[data-finder-panel]").boundingBox();
        if (panelBox && panelBox.x > 12) await page.mouse.click(4, Math.round(page.viewportSize()!.height / 2));
        else await page.keyboard.press("Escape");
      },
    ]) {
      await opener.press("Enter");
      await expect(page.getByRole("dialog")).toBeVisible();
      await close();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page).toHaveURL(/\/parfums\/catalogo\?type=arab$/);
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 40);
      await expect(opener).toBeFocused();
    }

    // Completing keeps the filters and shows the recommendation.
    await opener.press("Enter");
    await page.getByRole("button", { name: /Para mí/ }).click();
    await page.getByRole("button", { name: /Siguiente/ }).click();
    await page.getByRole("button", { name: /Fresco/ }).first().click();
    await page.getByRole("button", { name: /Siguiente/ }).click();
    await page.getByRole("button", { name: /Siguiente/ }).click();
    await page.getByRole("button", { name: /Moderado/ }).click();
    await page.getByRole("button", { name: /Siguiente/ }).click();
    await page.getByRole("button", { name: /Ver mi selección/ }).click();

    await expect(page).toHaveURL(/type=arab/);
    await expect(page).toHaveURL(/rw=mi/);
    await expect(page.locator("#recomendacion")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("a partial or forged recommendation in the URL is ignored", async ({ page }) => {
    await page.goto("/parfums/catalogo?rw=mi");
    await expect(page.locator("#recomendacion")).toHaveCount(0);
  });
});

test.describe("parfums cart drawer", () => {
  test("covers the viewport, shows the line and total, and a pending toast never sits over them", async ({ page }) => {
    await firstPurchasableCardAdd(page);
    await page.getByRole("button", { name: /Abrir carrito/ }).click();

    const drawer = page.locator("[data-cart-drawer]");
    await expect(drawer).toBeVisible();
    const viewport = page.viewportSize()!;
    const box = (await drawer.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(viewport.height - 1);

    const checkout = drawer.getByRole("link", { name: /Revisar y continuar/ });
    await expect(checkout).toBeVisible();
    // Poll: the drawer slides in, so the hit test is only meaningful once it
    // has settled in place.
    await expect
      .poll(() =>
        checkout.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return element.contains(hit);
        }),
      )
      .toBe(true);

    // No horizontal overflow inside a cart line, even at 320px.
    const overflow = await drawer.locator("[data-cart-line]").first().evaluate((line) => line.scrollWidth - line.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("import TikTok module", () => {
  test("embeds the Import consolidado video only after play, with an accessible link", async ({ page }) => {
    await page.goto("/import");
    const section = page.locator("section", { has: page.locator("#home-video-title") });
    await expect(section).toBeVisible();
    await expect(section.getByRole("link", { name: /Ver en TikTok/ })).toHaveAttribute(
      "href",
      "https://www.tiktok.com/@cruzialperu/video/7657015388252720402",
    );
    await expect(section.locator("iframe")).toHaveCount(0);
    await section.getByRole("button", { name: /Reproducir video/ }).click();
    await expect(section.locator("iframe")).toHaveAttribute(
      "src",
      /^https:\/\/www\.tiktok\.com\/player\/v1\/7657015388252720402/,
    );
  });

  test("the CSP frames TikTok and nothing else", async ({ request }) => {
    const response = await request.get("/import");
    const csp = response.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("frame-src 'self' https://www.tiktok.com");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
