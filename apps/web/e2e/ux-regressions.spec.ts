import { expect, test } from "@playwright/test";

// UX regressions found in the 2026-10 frontend audit. Data-independent where
// possible so they hold on the synthetic local stack and on a hosted Preview.

test("the gateway has one heading for assistive technology", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveText(/Parfums e Import/);
});

test("form controls are at least 16px on touch screens so iOS Safari does not zoom", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "touch-only rule");
  for (const route of ["/parfums/catalogo", "/parfums/checkout", "/parfums/contacto", "/libro-de-reclamaciones", "/parfums/combos"]) {
    await page.goto(route);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll("input, select, textarea")]
        .filter((control) => {
          const field = control as HTMLInputElement;
          if (["hidden", "checkbox", "radio"].includes(field.type)) return false;
          const box = field.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && parseFloat(getComputedStyle(field).fontSize) < 16;
        })
        .map((control) => `${control.tagName.toLowerCase()}[name=${(control as HTMLInputElement).name || "?"}]`),
    );
    expect(small, `${route} has controls under 16px`).toEqual([]);
  }
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

test("the Import mobile menu closes with Escape and returns focus to its toggle", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "the toggle only exists on phones");
  await page.goto("/import/carrito");
  const toggle = page.locator('button[aria-controls="import-mobile-nav"]');
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
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

test("carousels hold their rotation while keyboard focus is on any of their controls", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "timing probe runs once, on desktop");
  test.setTimeout(60_000);
  await page.goto("/parfums");
  const carousels = [
    { name: "hero", root: "[data-home-hero]", wait: 8_500, read: () => document.querySelector("[data-home-hero] [aria-current=true]")?.getAttribute("aria-label") ?? "" },
    { name: "combos", root: "[aria-label='Combos Cruzial'][role=region]", wait: 6_500, read: () => String([...document.querySelectorAll("[aria-label='Combos Cruzial'] article")].findIndex((slide) => (slide as HTMLElement).dataset.active === "true")) },
    { name: "rail", root: "[class*=marquee]", wait: 2_500, read: () => String(Math.round(document.querySelector("[class*=marquee] [class*=viewport]")?.scrollLeft ?? -1)) },
  ];
  let exercised = 0;
  for (const carousel of carousels) {
    const root = page.locator(carousel.root).first();
    // Sets with a single member or short rails do not rotate: nothing to hold.
    if (!(await root.count()) || (await root.locator("button").count()) === 0) continue;
    await root.scrollIntoViewIfNeeded();
    await page.mouse.move(2, 2);
    // The pause control is the one that used to be left out; it is checked first.
    const pause = root.getByRole("button", { name: /pausar|reanudar/i }).first();
    if ((await pause.count()) === 0) continue;
    await pause.focus();
    const before = await page.evaluate(carousel.read);
    await page.waitForTimeout(carousel.wait);
    expect(await page.evaluate(carousel.read), `${carousel.name} moved while its pause button had focus`).toBe(before);
    exercised += 1;
  }
  test.skip(exercised === 0, "no auto-rotating carousel on this stack");
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

test("combo builder puts the fragrance picker before its summary on phones", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "phone layout check");
  await page.goto("/parfums/combos");
  const builder = page.locator("[data-combo-builder]");
  await expect(builder).toBeVisible();
  const order = await builder.evaluate((root) => {
    const picker = root.querySelector<HTMLElement>("[class*=pickerColumn]");
    const summary = root.querySelector<HTMLElement>("[class*=summary]");
    return {
      picker: picker ? getComputedStyle(picker).gridRowStart : null,
      summary: summary ? getComputedStyle(summary).gridRowStart : null,
      pickerTop: picker?.getBoundingClientRect().top ?? Infinity,
      summaryTop: summary?.getBoundingClientRect().top ?? -Infinity,
    };
  });
  expect(order.picker).toBe("1");
  expect(order.summary).toBe("2");
  expect(order.pickerTop).toBeLessThan(order.summaryTop);
});

test("catalog category buttons and filter controls remain clear on mobile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "phone layout check");
  await page.goto("/parfums/catalogo");
  const categories = page.locator("nav[aria-label='Explorar por categoría'] button");
  await expect(categories).toHaveCount(3);
  const boxes = await categories.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, width: rect.width };
  }));
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(boxes.every((box) => box.width >= 60 && box.left >= 0 && box.right <= viewportWidth)).toBe(true);

  await page.getByRole("button", { name: /filtros/i }).click();
  const sheet = page.locator("#catalog-filters");
  await expect(sheet).toBeVisible();
  // Chip groups, not native selects; the sheet must fit inside the screen.
  await expect(sheet.locator("legend").first()).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Árabe", exact: true })).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await sheet.getByRole("button", { name: "Árabe", exact: true }).click();
  await expect(page.locator("[aria-live=polite]").filter({ hasText: "Tipo" })).toContainText("Árabe");
});

test("Import fallback contact status wraps inside the mobile hero", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "phone layout check");
  await page.goto("/import");
  const status = page.locator("[data-import-home-hero] [role='status']");
  if ((await status.count()) === 0) test.skip(true, "contact is configured on this environment");
  await expect(status).toBeVisible();
  const layout = await status.evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
    whiteSpace: getComputedStyle(element).whiteSpace,
  }));
  expect(layout.whiteSpace).toBe("normal");
  expect(layout.scroll).toBeLessThanOrEqual(layout.client);
});

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
