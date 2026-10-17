import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const route of ["/parfums", "/import"]) {
  test(`${route}: hover opens the full-size gallery with keyboard navigation and closes accessibly`, async ({ page }) => {
    test.skip(test.info().project.name !== "chromium", "Hover is verified in the fine-pointer desktop browser project.");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(route);
    const gallery = page.locator("[data-process-gallery]");
    const first = gallery.getByRole("button").first();
    await first.scrollIntoViewIfNeeded();
    await expect(first).toBeVisible();

    await first.hover();
    await expect.poll(() => first.evaluate((button) => {
      const transform = getComputedStyle(button).transform;
      return transform === "none" ? 1 : new DOMMatrixReadOnly(transform).a;
    })).toBeGreaterThan(1.03);

    await first.click();
    const dialog = page.getByRole("dialog", { name: "Galería de fotos" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("img", { name: "Selección de perfumes sellados" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cerrar galería" })).toBeFocused();
    const accessibility = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    expect(accessibility.violations).toEqual([]);

    await page.keyboard.press("ArrowRight");
    await expect(dialog.getByRole("img", { name: "Perfumes sellados preparados para el cuidado del pedido" })).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(dialog.getByRole("img", { name: "Selección de perfumes sellados" })).toBeVisible();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("button", { name: "Foto siguiente" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(first).toBeFocused();

    await first.click();
    await expect(dialog).toBeVisible();
    await page.locator("[data-lightbox-backdrop]").click({ position: { x: 4, y: 4 } });
    await expect(dialog).toHaveCount(0);
    await expect(first).toBeFocused();
  });

  test(`${route}: mobile tap opens the gallery and the close button dismisses it`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);
    const first = page.locator("[data-process-gallery]").getByRole("button").first();
    if (test.info().project.name === "mobile") {
      expect(await first.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches)).toBe(false);
    }
    await first.scrollIntoViewIfNeeded();
    await first.click();
    await expect(page.getByRole("dialog", { name: "Galería de fotos" })).toBeVisible();
    await page.getByRole("button", { name: "Cerrar galería" }).click();
    await expect(page.getByRole("dialog", { name: "Galería de fotos" })).toHaveCount(0);
    await expect(first).toBeFocused();
  });
}

test("reduced motion disables gallery hover transitions", async ({ page }) => {
  test.skip(test.info().project.name === "mobile", "Reduced motion hover is verified in the fine-pointer browser project.");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/parfums");
  const first = page.locator("[data-process-gallery]").getByRole("button").first();
  await first.scrollIntoViewIfNeeded();
  await first.hover();
  const motion = await first.evaluate((button) => ({
    transform: getComputedStyle(button).transform,
    transition: getComputedStyle(button).transitionProperty,
  }));
  expect(motion).toEqual({ transform: "none", transition: "none" });
});

test("collage keeps its desktop, tablet, and mobile layouts", async ({ page }) => {
  await page.goto("/parfums");
  const gallery = page.locator("[data-process-gallery]");
  const photos = gallery.getByRole("button");
  await expect(photos).toHaveCount(5);

  for (const [width, height, expectedPosition, minimumHeight] of [
    [1440, 1000, "absolute", 600],
    [768, 900, "absolute", 450],
    [390, 844, "relative", 400],
  ] as const) {
    await page.setViewportSize({ width, height });
    const layout = await gallery.evaluate((element) => {
      const first = element.querySelector("li");
      const rect = element.getBoundingClientRect();
      return {
        galleryHeight: rect.height,
        itemPosition: first ? getComputedStyle(first).position : "missing",
        imageRatio: (() => {
          const frame = first?.querySelector("[data-process-gallery-frame]")?.getBoundingClientRect();
          return frame ? { width: frame.width, height: frame.height } : null;
        })(),
      };
    });

    expect(layout.galleryHeight).toBeGreaterThanOrEqual(minimumHeight);
    expect(layout.itemPosition).toBe(expectedPosition);
    expect(layout.imageRatio).not.toBeNull();
    if (layout.imageRatio) {
      expect(layout.imageRatio.width / layout.imageRatio.height).toBeCloseTo(0.8, 1);
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await photos.first().scrollIntoViewIfNeeded();
  const accessibility = await new AxeBuilder({ page }).include("[data-process-gallery]").analyze();
  expect(accessibility.violations).toEqual([]);
});
