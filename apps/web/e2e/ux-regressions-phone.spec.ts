import { expect, test } from "@playwright/test";

// UX regressions from the 2026-10 frontend audit that only apply to phones (touch, narrow layout).
// Matched only by that Playwright project (playwright.config.ts), so no test is skipped by viewport.

test("form controls are at least 16px on touch screens so iOS Safari does not zoom", async ({ page }) => {
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

test("the Import mobile menu closes with Escape and returns focus to its toggle", async ({ page }) => {
  await page.goto("/import/carrito");
  const toggle = page.locator('button[aria-controls="import-mobile-nav"]');
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
});

test("combo builder puts the fragrance picker before its summary on phones", async ({ page }) => {
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

test("catalog category buttons and filter controls remain clear on mobile", async ({ page }) => {
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
