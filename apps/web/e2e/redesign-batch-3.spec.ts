import { expect, test, type Locator } from "@playwright/test";

// Redesign batch 3 (Home, Parfums, Catalogo, Producto, Combos). Data-independent where possible; the checks that need a rich
// catalog (more than 24 products, more than three sets) skip themselves on a stack that does not have one.

const SURFACE = "rgb(245, 245, 247)";
const INK = "rgb(29, 29, 31)";
const WHITE = "rgb(255, 255, 255)";

/** WCAG contrast of the first matching element's text colour (alpha blended over its own band) against its background. */
async function textContrast(target: Locator, band: Locator): Promise<number> {
  const [fg, bg] = await Promise.all([
    target.first().evaluate((el) => getComputedStyle(el).color),
    band.first().evaluate((el) => getComputedStyle(el).backgroundColor),
  ]);
  const parse = (css: string) => (css.match(/[\d.]+/g) ?? []).map(Number) as [number, number, number, number?];
  const [br, bgG, bb] = parse(bg);
  const [r, g, b, a = 1] = parse(fg);
  const blend = (c: number, back: number) => c * a + back * (1 - a);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = (x: number, y: number, z: number) => 0.2126 * lin(x) + 0.7152 * lin(y) + 0.0722 * lin(z);
  const l1 = lum(blend(r, br), blend(g, bgG), blend(b, bb));
  const l2 = lum(br, bgG, bb);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const bg = (locator: Locator) => locator.first().evaluate((el) => getComputedStyle(el).backgroundColor);

test.describe("gateway", () => {
  test("the official logo replaces the wordmark in the bar", async ({ page }) => {
    await page.goto("/");
    const logo = page.getByRole("img", { name: "Cruzial Perfumería" });
    await expect(logo).toBeVisible();
    expect(await logo.getAttribute("src")).toContain("logo-official");
    await expect(page.locator("main > p")).toHaveCount(0);
  });

  test("each door shows an approved photograph: bottles for Parfums, the container for Import", async ({ page }) => {
    await page.goto("/");
    const parfums = page.locator('a[data-unit="parfums"] img');
    const imp = page.locator('a[data-unit="import"] img');
    expect(decodeURIComponent((await parfums.getAttribute("src")) ?? "")).toContain("parfums-hero.webp");
    expect(decodeURIComponent((await imp.getAttribute("src")) ?? "")).toContain("import-conditions-container.webp");
  });

  test("a closed Import campaign is shown with a veil, an honest line and stays a link", async ({ page }) => {
    await page.goto("/");
    const door = page.locator('a[data-unit="import"]');
    await expect(door).toHaveAttribute("href", "/import");
    if ((await door.getAttribute("data-closed")) === "true") {
      await expect(door).toContainText("Estamos preparando el próximo consolidado");
      await expect(door).toContainText(/Próximamente|Apertura estimada: /);
      await expect(door).toHaveAttribute("aria-label", /Estamos preparando el próximo consolidado/);
    } else {
      await expect(door).not.toContainText("Estamos preparando el próximo consolidado");
      await expect(door).toContainText("Consolidados de perfumería");
    }
  });
});

test.describe("parfums home", () => {
  test("the sections are ordered: families, combos, recommender, craft", async ({ page }) => {
    await page.goto("/parfums");
    const order = await page.evaluate(() => {
      const ids = ["discovery-title", "combos-title", "finder-discovery-title", "craft-title"];
      return ids.flatMap((id) => {
        const heading = document.getElementById(id);
        return heading ? [{ id, top: heading.getBoundingClientRect().top + window.scrollY }] : [];
      });
    });
    expect(order.map((entry) => entry.id)).toContain("discovery-title");
    expect(order.map((entry) => entry.id)).toContain("craft-title");
    const tops = order.map((entry) => entry.top);
    expect(tops, order.map((entry) => entry.id).join(" > ")).toEqual([...tops].sort((a, b) => a - b));
    const ids = order.map((entry) => entry.id);
    if (ids.includes("combos-title")) expect(ids.indexOf("discovery-title")).toBeLessThan(ids.indexOf("combos-title"));
    if (ids.includes("combos-title") && ids.includes("finder-discovery-title")) {
      expect(ids.indexOf("combos-title")).toBeLessThan(ids.indexOf("finder-discovery-title"));
    }
  });

  test("the 100% originales strip, the family band and the recommender are not white", async ({ page }) => {
    await page.goto("/parfums");
    expect(await bg(page.getByRole("list", { name: "Lo esencial" }))).toBe(SURFACE);
    expect(await bg(page.locator('section[aria-labelledby="discovery-title"]'))).toBe(SURFACE);
    const finder = page.locator('section[aria-labelledby="finder-discovery-title"]');
    if ((await finder.count()) > 0) {
      const image = await finder.first().evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(image, "a gradient, not white").toContain("gradient");
      const lead = finder.locator("h2");
      expect(await textContrast(lead, finder.locator("xpath=."))).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("the family cards say Diseñador and are about 20% smaller than the column", async ({ page }) => {
    await page.goto("/parfums");
    const section = page.locator('section[aria-labelledby="discovery-title"]');
    await expect(section.getByText("Diseñador", { exact: true })).toBeVisible();
    await expect(section.getByText("Designer")).toHaveCount(0);
    const viewportWidth = page.viewportSize()!.width;
    test.skip(viewportWidth < 768, "on phones the cards are a swipe row");
    const tiles = section.locator("ul > li").first().locator("a");
    const row = section.locator("ul").first();
    const [tile, list, head] = await Promise.all([tiles.boundingBox(), row.boundingBox(), section.locator("h2").boundingBox()]);
    expect(list!.width).toBeLessThan(viewportWidth * 0.86);
    expect(tile!.width).toBeLessThan(((list!.width - 48) / 3) * 1.01);
    expect(head).toBeTruthy();
  });

  test("'Del frasco original a tu piel' is a dark grey band with no photographs", async ({ page }) => {
    await page.goto("/parfums");
    const craft = page.locator('section[aria-labelledby="craft-title"]');
    await craft.scrollIntoViewIfNeeded();
    expect(await bg(craft)).toBe("rgb(43, 43, 46)");
    await expect(craft.locator("img")).toHaveCount(0);
    expect(await textContrast(craft.locator("h2"), craft)).toBeGreaterThanOrEqual(7);
    expect(await textContrast(craft.locator("ol li p").first(), craft)).toBeGreaterThanOrEqual(4.5);
  });

  test("the TikTok band is the darkest of the page and its text passes AA", async ({ page }) => {
    await page.goto("/parfums");
    const band = page.locator('section[aria-labelledby="home-video-title"], section[aria-labelledby="tiktok-profile-title"]');
    await band.first().scrollIntoViewIfNeeded();
    expect(await bg(band)).toBe("rgb(23, 23, 26)");
    expect(await textContrast(band.locator("h2"), band)).toBeGreaterThanOrEqual(7);
    expect(await textContrast(band.locator("p:not([class*=eyebrow])").first(), band)).toBeGreaterThanOrEqual(4.5);
  });
});

test.describe("catalogo", () => {
  test("no hero: a short intro, then category cards, then the filter bar, then the grid", async ({ page }) => {
    await page.goto("/parfums/catalogo");
    await expect(page.locator("[data-home-hero]")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nuestra Colección");
    const y = async (locator: Locator) => (await locator.first().boundingBox())!.y;
    const intro = await y(page.getByRole("heading", { level: 1 }));
    const doors = await y(page.getByRole("navigation", { name: "Explorar por categoría" }));
    const bar = await y(page.getByRole("searchbox"));
    const grid = await y(page.locator("[data-product-grid]"));
    expect(intro).toBeLessThan(doors);
    expect(doors).toBeLessThan(bar);
    expect(bar).toBeLessThan(grid);
  });

  test("the page sits on the light grey surface and the cards are white", async ({ page }) => {
    await page.goto("/parfums/catalogo");
    const layout = page.locator('section[aria-labelledby="catalog-results-title"]');
    expect(await bg(layout)).toBe(SURFACE);
    expect(await bg(page.locator('section[aria-labelledby="catalog-title"]'))).toBe(SURFACE);
    expect(await bg(page.locator("[data-product-card]"))).toBe(WHITE);
  });

  test("the filters are type, gender, family and brand: no budget and no whole bottle", async ({ page }) => {
    await page.goto("/parfums/catalogo");
    await page.getByRole("button", { name: /^Filtros/ }).click();
    const panel = page.getByRole("dialog", { name: "Filtrar" });
    for (const legend of ["Tipo", "Género", "Familia olfativa", "Marca"]) {
      await expect(panel.getByText(legend, { exact: true })).toBeVisible();
    }
    for (const gone of ["Presupuesto", "Formato", "Frasco completo", /Hasta S\//]) {
      await expect(panel.getByText(gone)).toHaveCount(0);
    }
    await expect(panel.getByRole("button", { name: "Diseñador" })).toBeVisible();
    await expect(panel.getByText("Designer")).toHaveCount(0);
  });

  test("the brand filter narrows the grid to that brand and shows as an active filter", async ({ page }) => {
    await page.goto("/parfums/catalogo");
    await page.getByRole("button", { name: /^Filtros/ }).click();
    const select = page.getByRole("dialog", { name: "Filtrar" }).getByRole("combobox", { name: "Marca" });
    const brands = (await select.locator("option").allTextContents()).filter((label) => !/^Todas/.test(label));
    test.skip(brands.length === 0, "no brands in this catalog");
    const brand = brands[0]!;
    await select.selectOption({ label: brand });
    await page.keyboard.press("Escape");
    const cards = page.locator("[data-product-card]");
    expect(await cards.count()).toBeGreaterThan(0);
    const labels = await cards.locator("[class*=cardBrand]").allTextContents();
    expect(new Set(labels)).toEqual(new Set([brand]));
    await expect(page.getByRole("button", { name: "Quitar filtro Marca" })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("brand")).toBe(brand);
  });

  test("each card offers 3, 5 and 10 ml; the chosen size is solid ink with white text; no generic quantity", async ({ page }) => {
    await page.goto("/parfums/catalogo");
    const card = page.locator("[data-product-card]").filter({ has: page.locator("[data-size-picker] input:not(:disabled)") }).first();
    await expect(card).toBeVisible();
    await expect(card.getByRole("button", { name: /Aumentar cantidad|Reducir cantidad/ })).toHaveCount(0);
    await expect(card.locator("[data-quantity-row]")).toHaveCount(0);
    const picker = card.locator("[data-size-picker]");
    await expect(picker.locator("label")).toHaveText(["3 ml", "5 ml", "10 ml"]);

    const chip = (label: string) => picker.locator("label", { hasText: label }).locator("span");
    const enabled = picker.locator("input:not(:disabled)");
    expect(await enabled.count()).toBeGreaterThan(0);
    const checked = picker.locator("input:checked");
    await expect(checked).toHaveCount(1);
    const firstLabel = (await picker.locator("label:has(input:checked)").innerText()).trim();
    await expect(chip(firstLabel)).toHaveCSS("background-color", INK);
    await expect(chip(firstLabel)).toHaveCSS("color", WHITE);

    if ((await enabled.count()) > 1) {
      const price = card.locator("[data-price]");
      const before = await price.innerText();
      const other = picker.locator("label:has(input:not(:disabled):not(:checked))").first();
      const otherLabel = (await other.innerText()).trim();
      await other.click();
      await expect(chip(otherLabel)).toHaveCSS("background-color", INK);
      await expect(chip(otherLabel)).toHaveCSS("color", WHITE);
      await expect(chip(firstLabel)).not.toHaveCSS("background-color", INK);
      await expect(price).not.toHaveText(before);
    }
  });

  test("the size picker works from the keyboard and Añadir adds the chosen size", async ({ page }) => {
    await page.goto("/parfums/catalogo");
    // A card with at least two sizes in stock, so there is something to move to.
    const cards = page.locator("[data-product-card]");
    const index = await cards.evaluateAll((els) => els.findIndex((el) => el.querySelectorAll("[data-size-picker] input:not(:disabled)").length > 1));
    const card = index >= 0 ? cards.nth(index) : cards.filter({ has: page.locator("[data-size-picker] input:not(:disabled)") }).first();
    const checked = card.locator("[data-size-picker] input:checked");
    const initial = await checked.inputValue();
    await checked.focus();
    if (index >= 0) {
      await page.keyboard.press("ArrowRight");
      await expect(checked).not.toHaveValue(initial);
    }
    const chosen = await checked.inputValue();
    await card.getByRole("button", { name: /^Añadir/ }).click();
    await expect(page.getByRole("button", { name: /Abrir carrito, 1 producto/ })).toBeVisible();
    const stored = await page.evaluate(() => Object.values(localStorage).join("|"));
    expect(stored).toContain(`decant-${chosen}ml`);
  });

  test("whole bottles are not offered in the catalog, even with the old ?format=bottle link", async ({ page }) => {
    for (const path of ["/parfums/catalogo", "/parfums/catalogo?format=bottle"]) {
      await page.goto(path);
      const grid = page.locator("[data-product-grid]");
      await expect(grid).toBeVisible();
      await expect(grid.getByText(/Frasco \d+ ml|frasco \d+ ml/)).toHaveCount(0);
      await expect(page.locator("[data-bottle-gift-note]")).toHaveCount(0);
    }
    await page.goto("/parfums/catalogo?format=bottle");
    await page.getByRole("button", { name: /^Filtros/ }).click();
    await expect(page.getByRole("button", { name: "Frasco completo" })).toHaveCount(0);
  });

  test("it shows 24 products per view with Vista 1, Vista 2… and goes back to Vista 1 when a filter changes", async ({ page }) => {
    await page.goto("/parfums/catalogo");
    const cards = page.locator("[data-product-card]");
    const pager = page.locator("[data-catalog-pager]");
    if ((await pager.count()) === 0) {
      expect(await cards.count(), "a single view holds at most 24").toBeLessThanOrEqual(24);
      test.skip(true, "this stack has 24 products or fewer");
    }
    expect(await cards.count()).toBe(24);
    await expect(pager.getByRole("button", { name: "Vista 1" })).toHaveAttribute("aria-current", "page");
    const firstName = await cards.first().locator("h3").innerText();
    await pager.getByRole("button", { name: "Vista 2" }).click();
    await expect(pager.getByRole("button", { name: "Vista 2" })).toHaveAttribute("aria-current", "page");
    await expect(cards.first().locator("h3")).not.toHaveText(firstName);
    await expect.poll(() => new URL(page.url()).searchParams.get("vista")).toBe("2");
    expect(await cards.count()).toBeGreaterThan(0);
    expect(await cards.count()).toBeLessThanOrEqual(24);

    await page.getByRole("searchbox").fill("a");
    await expect(page.locator("[data-catalog-pager] [aria-current=page]")).toHaveText("Vista 1");
  });

  test("a shared link with ?vista=2 opens on that view", async ({ page }) => {
    await page.goto("/parfums/catalogo?vista=2");
    const pager = page.locator("[data-catalog-pager]");
    test.skip((await pager.count()) === 0, "this stack has 24 products or fewer");
    await expect(pager.getByRole("button", { name: "Vista 2" })).toHaveAttribute("aria-current", "page");
  });

  test("product names are semibold and about 10% larger than the body text size", async ({ page }) => {
    await page.goto("/parfums/catalogo");
    const name = page.locator("[data-product-card] h3").first();
    const style = await name.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { weight: cs.fontWeight, size: parseFloat(cs.fontSize) };
    });
    expect(style.weight).toBe("600");
    // 1.0625rem * 1.1 = 18.7px on desktop; phones use 19.5px.
    expect(style.size).toBeGreaterThanOrEqual(18.5);
  });
});

test.describe("product page", () => {
  test("the page is on the grey surface with white tiles", async ({ page }) => {
    await page.goto("/parfums/catalogo");
    const href = await page.locator("[data-product-card] a[href^='/parfums/productos/']").first().getAttribute("href");
    await page.goto(href!);
    const pageBackground = await page.locator("[data-product-detail]").evaluate((el) => {
      for (let node: Element | null = el.parentElement; node; node = node.parentElement) {
        const color = getComputedStyle(node).backgroundColor;
        if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") return color;
      }
      return "";
    });
    expect(pageBackground).toBe(SURFACE);
    expect(await bg(page.locator("[data-product-stage]"))).not.toBe(SURFACE);
  });

  test("photos change every 5 s, wait while the pointer is on them and stop once the visitor takes over", async ({ page }) => {
    test.skip(process.env.E2E_LOCAL_FIXTURES !== "1", "needs the two-photo synthetic product");
    await page.clock.install();
    await page.goto("/parfums/productos/local-qa-galeria");
    const counter = page.locator("[data-product-stage] span[aria-live]");
    const total = await page.locator("[data-gallery-thumbs] button").count();
    test.skip(total < 2, "this stack has no product with several photos");
    const read = async () => Number((await counter.textContent())!.split("/")[0]!.trim());
    const start = await read();
    await page.clock.runFor(4_000);
    expect(await read(), "not yet").toBe(start);
    await page.clock.runFor(1_100);
    await expect(counter).toHaveText(`${(start % total) + 1} / ${total}`);

    await page.locator("[data-product-stage]").hover();
    const held = await read();
    await page.clock.runFor(15_000);
    expect(await read(), "waits while hovered").toBe(held);
    await page.mouse.move(0, 0);
    await page.clock.runFor(5_100);
    await expect(counter).toHaveText(`${(held % total) + 1} / ${total}`);

    await page.locator("[data-gallery-next]").click();
    const chosen = await read();
    await page.mouse.move(0, 0);
    await page.clock.runFor(30_000);
    expect(await read(), "stays where the visitor put it").toBe(chosen);
    await expect(page.locator("[data-gallery-rotation]")).toHaveAttribute("aria-pressed", "true");
  });

  test("the pause control stops the rotation and under reduced motion there is none", async ({ page }) => {
    test.skip(process.env.E2E_LOCAL_FIXTURES !== "1", "needs the two-photo synthetic product");
    await page.clock.install();
    await page.goto("/parfums/productos/local-qa-galeria");
    const counter = page.locator("[data-product-stage] span[aria-live]");
    test.skip((await page.locator("[data-gallery-thumbs] button").count()) < 2, "no multi-photo product");
    const start = (await counter.textContent())!;
    await page.locator("[data-gallery-rotation]").click();
    await page.mouse.move(0, 0);
    await page.clock.runFor(20_000);
    await expect(counter).toHaveText(start);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await expect(page.locator("[data-gallery-rotation]")).toHaveCount(0);
    const still = (await counter.textContent())!;
    await page.clock.runFor(20_000);
    await expect(counter).toHaveText(still);
  });
});

test.describe("combos page", () => {
  test("no hero image, 'Ver sets' and the carousel of sets at the bottom", async ({ page }) => {
    await page.goto("/parfums/combos");
    await expect(page.locator("main header img")).toHaveCount(0);
    const cta = page.getByRole("link", { name: /^Ver sets/ });
    const sets = page.locator("[data-sets-carousel]");
    if ((await sets.count()) === 0) {
      await expect(cta).toHaveCount(0);
      test.skip(true, "no published sets on this stack");
    }
    await expect(cta).toHaveText(/^Ver sets\s*→?$/);
    await expect(page.getByText("Ver sets curados")).toHaveCount(0);
    const builder = await page.locator("#arma-combo").boundingBox();
    const carousel = await sets.boundingBox();
    expect(carousel!.y, "sets come after the builder").toBeGreaterThan(builder!.y);
  });

  test("three sets are in view on desktop, one every 4 s moves the window and arrows or hover stop it", async ({ page }) => {
    test.skip(page.viewportSize()!.width < 1024, "three in view needs a desktop width");
    await page.clock.install();
    await page.goto("/parfums/combos");
    const carousel = page.locator("[data-sets-carousel]");
    test.skip((await carousel.count()) === 0, "no published sets on this stack");
    const slides = carousel.locator("[data-sets-slide]");
    const total = await slides.count();
    await expect(carousel).toHaveAttribute("data-visible", "3");
    const inView = () => carousel.locator("[data-sets-slide]:not([inert])").count();
    expect(await inView()).toBe(Math.min(3, total));
    test.skip(total <= 3, "three sets or fewer: nothing to rotate");

    await page.clock.runFor(3_900);
    await expect(carousel).toHaveAttribute("data-index", "0");
    await page.clock.runFor(200);
    await expect(carousel).toHaveAttribute("data-index", "1");
    expect(await inView()).toBe(3);

    await carousel.hover();
    await page.clock.runFor(12_000);
    await expect(carousel).toHaveAttribute("data-index", "1");
    await page.mouse.move(0, 0);
    await carousel.locator("[data-sets-next]").click();
    const index = Number(await carousel.getAttribute("data-index"));
    await page.clock.runFor(30_000);
    await expect(carousel).toHaveAttribute("data-index", String(index));
  });

  test("a set outside the window cannot take keyboard focus", async ({ page }) => {
    test.skip(page.viewportSize()!.width < 1024, "three in view needs a desktop width");
    await page.goto("/parfums/combos");
    const hidden = page.locator("[data-sets-slide][inert]");
    test.skip((await hidden.count()) === 0, "every set is in view");
    expect(await hidden.first().locator("button, a").evaluateAll((els) => els.length)).toBeGreaterThan(0);
    const focusable = await hidden.first().evaluate((slide) => {
      const button = slide.querySelector("button") as HTMLButtonElement;
      button.focus();
      return document.activeElement === button;
    });
    expect(focusable).toBe(false);
  });
});
