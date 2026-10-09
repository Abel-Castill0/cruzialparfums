import { expect, test } from "@playwright/test";

// UX regressions found in the 2026-10 frontend audit. Data-independent where
// possible so they hold on the synthetic local stack and on a hosted Preview. Viewport-specific
// checks live in ux-regressions-phone.spec.ts and ux-regressions-desktop.spec.ts.

test("the gateway has one heading for assistive technology", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveText(/Parfums e Import/);
});

test("set cards never show an empty photo panel and their size choice is a labelled group", async ({ page }) => {
  await page.goto("/parfums/combos");
  const cards = page.locator("[data-combo-card]");
  const count = await cards.count();
  test.skip(count === 0, "no published sets on this stack");
  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);
    const hasPhoto = (await card.locator("img").count()) > 0;
    const panelHeight = await card.locator("[class*=comboMedia]").first().evaluate((panel) => panel.getBoundingClientRect().height);
    // Either real photos fill the panel, or it collapses to a one-line tag.
    expect(hasPhoto || panelHeight < 90, `set card ${index} shows an empty panel`).toBe(true);
    await expect(card.locator('[aria-label^="Tamaño de"]').first()).toHaveAttribute("role", "group");
  }
});

test("the Parfums contact form carries no wholesale topic or copy (wholesale belongs to Import)", async ({ page }) => {
  await page.goto("/parfums/contacto");
  await expect(page.locator("main")).not.toContainText(/por mayor|mayorista|reventa/i);
  const options = await page.locator("select option").allTextContents();
  expect(options.join("|")).not.toMatch(/mayor/i);
});

test("the floating WhatsApp button never sits on top of the hero controls or the footer links", async ({ page }) => {
  const coveredBy = (selector: string) => page.evaluate((sel) => {
    const fab = document.querySelector("a[aria-label='Escríbenos por WhatsApp'][class*=whatsappFloat]");
    if (!fab) return ["floating WhatsApp button missing"];
    return [...document.querySelectorAll<HTMLElement>(sel)]
      .filter((element) => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight; })
      .filter((element) => {
        const box = element.getBoundingClientRect();
        const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return Boolean(top && fab.contains(top));
      })
      .map((element) => element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.tagName);
  }, selector);

  for (const [width, height] of [[390, 844], [820, 1180], [1024, 768], [1440, 900]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/parfums");
    await page.waitForTimeout(400);
    expect(await coveredBy("[data-home-hero] button, [data-home-hero] a"), `hero controls at ${width}x${height}`).toEqual([]);
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    await page.waitForTimeout(300);
    expect(await coveredBy("footer a"), `footer links at ${width}x${height}`).toEqual([]);
  }
});

test("product rail resumes its automatic movement after the pointer leaves", async ({ page }) => {
  await page.goto("/parfums");
  const rail = page.locator('[data-product-marquee] [data-loop="true"]').first();
  test.skip((await rail.count()) === 0, "no long product rail on this environment");
  await rail.scrollIntoViewIfNeeded();
  const box = await rail.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  const position = () => rail.evaluate((element) => element.scrollLeft);
  const whileHovered = await position();
  await page.waitForTimeout(700);
  expect(await position()).toBeCloseTo(whileHovered, 0);
  await page.mouse.move(2, 2);
  await page.waitForTimeout(1_500);
  expect(await position()).toBeGreaterThan(whileHovered + 8);
});

// "Import fallback contact status wraps inside the mobile hero" lives in isolated-contact-unconfigured.spec.ts:
// it needs the contact deliberately unconfigured, which only an isolated, last-running project may do.

test("text needed to decide or buy is at least 12px and combo size choices keep their own style", async ({ page }) => {
  const fontOf = (selector: string) => page.locator(selector).first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize));

  await page.goto("/parfums/checkout");
  expect(await fontOf("[data-checkout-submit]"), "checkout submit button").toBeGreaterThanOrEqual(12);

  await page.goto("/parfums/catalogo");
  const addButtons = page.getByRole("button", { name: /^Añadir/ });
  if ((await addButtons.count()) > 0) {
    expect(await addButtons.first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize)), "catalog add button").toBeGreaterThanOrEqual(12);
  }

  await page.goto("/parfums/combos");
  const option = page.locator("#arma-combo [data-combo-option]").first();
  if ((await option.count()) > 0) {
    await option.scrollIntoViewIfNeeded();
    await option.click();
    const size = page.locator("#arma-combo [class*=summaryLineSizes] button").first();
    await expect(size).toBeVisible();
    // A leaked "× remove" rule once made these 18px with no border.
    const style = await size.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { font: parseFloat(computed.fontSize), border: parseFloat(computed.borderTopWidth) };
    });
    expect(style.font).toBeGreaterThanOrEqual(12);
    expect(style.font).toBeLessThanOrEqual(14);
    expect(style.border).toBeGreaterThan(0);
  }
});

test("checkout shipping: pick a Shalom agency from the district map, by mouse and keyboard", async ({ page }) => {
  await page.goto("/parfums/checkout");
  const panel = page.locator("[data-shalom-panel]");
  await expect(panel).toBeVisible();
  // Nothing is listed until the customer narrows by district or search.
  await expect(page.locator('input[name="shalom-agency"][value]:not([value="other"])')).toHaveCount(0);

  const tile = page.locator('[data-district="Los Olivos"]');
  await tile.focus();
  await page.keyboard.press("Enter");
  await expect(tile).toHaveAttribute("aria-pressed", "true");
  const agencies = page.locator('input[name="shalom-agency"]:not([value="other"])');
  expect(await agencies.count()).toBeGreaterThan(1);

  // A real click (not forced) that is retried: it must reach the card, and a
  // click that lands before React hydrates the form is reverted.
  await expect(async () => {
    await agencies.first().check({ timeout: 2_000 });
    await expect(agencies.first()).toBeChecked({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  // An agency in the list is the selection: the free-text district is not asked for.
  await expect(page.locator("#checkout-district")).toHaveCount(0);

  await page.getByRole("searchbox", { name: "Buscar agencia Shalom" }).fill("zzzz-no-existe");
  await expect(page.getByRole("status").filter({ hasText: "No encontramos agencias" })).toBeVisible();
  // The earlier pick stays visible even when the list no longer shows it.
  await expect(page.locator("[data-shalom-chosen]")).toBeVisible();
});

test("checkout shipping: motorizado flags restricted districts and offers Shalom instead", async ({ page }) => {
  await page.goto("/parfums/checkout");
  await page.getByRole("radio", { name: /Motorizado/ }).check({ force: true });
  await expect(page.locator("[data-motorizado-panel]")).toBeVisible();

  await page.locator('[data-district="Comas"]').click();
  const callout = page.locator("[data-motorizado-panel] [role=status]");
  await expect(callout).toContainText("Acceso restringido en Comas");
  await expect(page.locator("#checkout-motorizado-district")).toHaveValue("Comas");

  await page.locator('[data-district="Miraflores"]').click();
  await expect(callout).not.toContainText("Acceso restringido");
  await expect(callout).toContainText("Te cotizamos el motorizado por WhatsApp");

  await page.locator('[data-district="Ate"]').click();
  await page.getByRole("button", { name: "Prefiero recoger en Shalom" }).click();
  await expect(page.locator("[data-shalom-panel]")).toBeVisible();
});

test("a product with several photos gets a gallery: thumbnails, arrows and keyboard", async ({ page }) => {
  // Hosted data: a real catalog product with several photos. Local stack: the synthetic two-photo product.
  await page.goto(process.env.E2E_LOCAL_FIXTURES === "1" ? "/parfums/productos/local-qa-galeria" : "/parfums/productos/khamrah-clasico");
  const thumbs = page.locator("[data-gallery-thumbs] button");
  test.skip((await thumbs.count()) < 2, "this stack has no product with several photos");

  const counter = page.locator("[data-product-stage] span[aria-live]");
  const total = await thumbs.count();
  // The stage opens on the default presentation's own photo when it has one (not necessarily photo 1).
  await expect(counter).toHaveText(new RegExp(`^\\d+ / ${total}$`));
  const start = Number((await counter.textContent())!.split("/")[0]!.trim());
  await expect(thumbs.nth(start - 1)).toHaveAttribute("aria-current", "true");
  await page.locator("[data-gallery-next]").click();
  await expect(counter).toHaveText(`${(start % total) + 1} / ${total}`);
  await thumbs.nth(total - 1).click();
  await expect(counter).toHaveText(`${total} / ${total}`);
  await page.locator("[data-product-stage]").focus();
  await page.keyboard.press("ArrowRight");
  await expect(counter).toHaveText(`1 / ${total}`);
  await expect(thumbs.first()).toHaveAttribute("aria-current", "true");
});

test("a product with one photo shows no gallery controls", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/parfums/catalogo");
  const hrefs = (await page.locator("[data-product-card] a[href^='/parfums/productos/']").evaluateAll(
    (anchors) => anchors.map((anchor) => anchor.getAttribute("href") ?? ""),
  )).filter(Boolean).slice(0, 8);
  for (const href of hrefs) {
    await page.goto(href);
    const thumbs = await page.locator("[data-gallery-thumbs] button").count();
    const arrows = await page.locator("[data-gallery-next]").count();
    // Controls appear together or not at all.
    expect(arrows > 0, href).toBe(thumbs > 1);
  }
});
