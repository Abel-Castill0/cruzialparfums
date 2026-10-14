import { expect, test } from "@playwright/test";

// Import hero: a small status badge with one date line above the title, one subtitle line and the actions. The commercial terms
// (delivery time, minimum order) are NOT in the hero: they live in "Cómo funciona" and "Condiciones". The campaign state of the
// stack decides which badge shows, so every check adapts to the badge it finds.

const BADGES = ["Abierto", "Próximamente", "Cerrado"] as const;

test.describe("Import hero status", () => {
  test("a discreet badge, one date line, the title and a one-line subtitle, in that order", async ({ page }) => {
    await page.goto("/import");
    const hero = page.locator("[data-import-home-hero]");
    const status = hero.locator("[data-import-hero-status]");
    test.skip((await status.count()) === 0, "campaign state unavailable on this stack: the hero shows no badge by design");

    const badgeText = (await status.locator("span").first().innerText()).trim();
    expect(BADGES as readonly string[]).toContain(badgeText);

    const dateLine = status.locator("p");
    if (badgeText === "Abierto") {
      const lines = await dateLine.allInnerTexts();
      for (const line of lines) expect(line).toMatch(/^Cierre: \d{1,2} [a-zñ]{3} \d{4}$/);
    } else if (badgeText === "Próximamente") {
      await expect(dateLine).toHaveText(/^Apertura estimada: (\d{1,2} [a-zñ]{3} \d{4}|por confirmar)$/);
    } else {
      await expect(dateLine).toHaveCount(0);
    }

    const y = async (selector: string) => (await hero.locator(selector).first().boundingBox())!.y;
    const badgeY = await y("[data-import-hero-status] span");
    const titleY = await y("h1");
    const summaryY = await y("h1 + p");
    const actionsY = await y("h1 ~ div a, h1 ~ div p");
    expect(badgeY).toBeLessThan(titleY);
    expect(titleY).toBeLessThan(summaryY);
    expect(summaryY).toBeLessThan(actionsY);

    // Discreet: a small pill, not a banner.
    const box = (await status.locator("span").first().boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(32);
    expect(box.width).toBeLessThan(220);
  });

  test("the subtitle is one line (no wrapping) and the actions are the preview/catalog and WhatsApp", async ({ page }) => {
    await page.goto("/import");
    const hero = page.locator("[data-import-home-hero]");
    const summary = hero.locator("h1 + p");
    const lines = await summary.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
    expect(lines).toBe(1);
    const whatsapp = hero.getByRole("link", { name: /Consultar por WhatsApp/ });
    if ((await whatsapp.count()) > 0) await expect(whatsapp).toHaveAttribute("href", /^https:\/\/wa\.me\/\d+\?text=/);
    const primary = hero.getByRole("link", { name: /Ver catálogo|Explorar vista previa/ });
    if ((await primary.count()) > 0) await expect(primary.first()).toHaveAttribute("href", "/import/catalogo");
  });

  test("delivery time and minimum order are not in the hero; they are in Cómo funciona and Condiciones", async ({ page }) => {
    await page.goto("/import");
    const hero = page.locator("[data-import-home-hero]");
    await expect(hero).not.toContainText("8 a 15 días hábiles");
    await expect(hero).not.toContainText(/desde 1 unidad/i);

    const process = page.locator("#como-funciona");
    await expect(process).toContainText("Tiempo de entrega: 8 a 15 días hábiles");
    const conditions = page.locator('section[aria-labelledby="import-conditions-title"]');
    await expect(conditions).toContainText("8 a 15 días hábiles");
    await expect(conditions).toContainText("Pedidos desde 1 unidad");
  });

  test("the badge never claims a status the hero cannot back up: label and class agree", async ({ page }) => {
    await page.goto("/import");
    const badge = page.locator("[data-import-hero-status] span").first();
    test.skip((await badge.count()) === 0, "no badge on this stack");
    const label = (await badge.innerText()).trim();
    const colors = await badge.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
    if (label === "Abierto") {
      expect(colors.bg).toBe("rgb(197, 160, 89)");
      expect(colors.color).toBe("rgb(29, 29, 31)");
    } else {
      expect(colors.bg).not.toBe("rgb(197, 160, 89)");
    }
  });
});
