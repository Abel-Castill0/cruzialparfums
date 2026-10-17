import { expect, test } from "@playwright/test";
import { GATE_B_ADMIN_STATE, hasIdentity, PARFUMS_VIEWER_STATE } from "./auth-state";
import { LOCAL_DB_AVAILABLE, localSql } from "./local-db";

// Editable storefront copy (`content_blocks` + `carousel_items`, /admin/contenido). Editing a text must reach the public
// page within seconds (tag `content-blocks`), "Restablecer" must bring the original copy back by deleting the row, and a
// viewer must never be offered the editor. Disposable local stack only; every mutation is restored in a finally block
// (last resort via SQL) so the suite stays rerun-safe regardless of where a test fails.

const HERO_TITLE = "QA LOCAL — título de portada editable";
const UNIT_PARFUMS = "11111111-1111-4111-8111-111111111111";
const SERVER_ACTION_TIMEOUT = 15_000;

// The hero card of the content editor and its three forms (save, visibility, reset). Each form is addressed by an input it
// alone owns, so the assertions never depend on hashed CSS class names.
function heroCard(page: import("@playwright/test").Page) {
  return page.locator('section#page-parfums li[data-section="hero"]');
}
const saveForm = (card: import("@playwright/test").Locator) => card.locator('form:has(input[name="blockType"])');
const visibilityForm = (card: import("@playwright/test").Locator) => card.locator('form:has(input[type="hidden"][name="isVisible"])');
const resetForm = (card: import("@playwright/test").Locator) => card.locator('form:has(input[name="confirmReset"])');
// One message per form: `role="alert"` on error, `role="status"` on success.
const feedback = (form: import("@playwright/test").Locator) => form.locator("p[data-state]");

/** Deletes the parfums hero row, whatever state a failed test left behind. */
function restoreHero() {
  localSql(
    `delete from public.content_blocks where business_unit_id = '${UNIT_PARFUMS}' and page_slug = 'parfums' and section_key = 'hero';`,
  );
}

function heroRowCount(): string {
  return localSql(
    `select count(*) from public.content_blocks where business_unit_id = '${UNIT_PARFUMS}' and page_slug = 'parfums' and section_key = 'hero';`,
  );
}

// The carousel block of the Parfums rail (`destacados`) and its drift-speed slider.
const CAROUSEL_SPEED = 52;
function carouselCard(page: import("@playwright/test").Page) {
  return page.locator('section#page-parfums li[data-section="destacados"]');
}

/** Deletes the parfums/destacados row, whatever state a failed test left behind. */
function restoreDestacados() {
  localSql(
    `delete from public.content_blocks where business_unit_id = '${UNIT_PARFUMS}' and page_slug = 'parfums' and section_key = 'destacados';`,
  );
}

function destacadosRowCount(): string {
  return localSql(
    `select count(*) from public.content_blocks where business_unit_id = '${UNIT_PARFUMS}' and page_slug = 'parfums' and section_key = 'destacados';`,
  );
}

/** Sets a React-controlled `<input type="range">` (Playwright's fill() refuses non-text inputs). */
async function setRange(input: import("@playwright/test").Locator, value: number) {
  await input.evaluate((element, next) => {
    const range = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(range, String(next));
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

test.describe("Contenido web", () => {
  // Both journeys edit and delete the SAME parfums/hero row, so they must not
  // run in parallel: one test's "Restablecer"/cleanup would delete the row the
  // other is mid-edit on.
  test.describe.configure({ mode: "serial" });
  test.skip(!LOCAL_DB_AVAILABLE || !hasIdentity("E2E_GATE_B_ADMIN"), "requires the disposable local stack and the E2E_GATE_B_ADMIN_* identity");
  test.use({ storageState: GATE_B_ADMIN_STATE, viewport: { width: 1280, height: 900 } });

  test("editing the hero title reaches /parfums and Restablecer brings the original copy back", async ({ page, browser }) => {
    const visitor = await (await browser.newContext({ storageState: { cookies: [], origins: [] } })).newPage();
    const publicTitle = async () => {
      await visitor.reload();
      return (await visitor.locator("[data-home-hero] h1").textContent())?.trim() ?? "";
    };

    try {
      restoreHero();
      await visitor.goto("/parfums");
      const original = await publicTitle();
      expect(original, "the hero starts on the original copy").not.toBe("");

      // 1. The owner edits the title from the admin.
      await page.goto("/admin/contenido");
      const card = heroCard(page);
      await card.locator("summary").click();
      const form = saveForm(card);
      await form.locator('input[name="title"]').fill(HERO_TITLE);
      await form.getByRole("checkbox", { name: "Aplicar esta edición en la web" }).check();
      await form.getByRole("button", { name: "Guardar" }).click();
      await expect(feedback(form)).toHaveText("Contenido guardado.", { timeout: SERVER_ACTION_TIMEOUT });

      // 2. The public page shows the edit within seconds (never at the 5-minute TTL).
      const savedAt = Date.now();
      await expect.poll(publicTitle, { timeout: 5_000, intervals: [250] }).toBe(HERO_TITLE);
      expect(Date.now() - savedAt, "the edit shows within 5 s").toBeLessThan(5_000);

      // 3. The admin card reports the edit is applied, and "Restablecer" removes the row.
      await page.reload();
      await expect(card).toContainText("Editado · aplicado en la web");
      await card.getByRole("button", { name: "Restablecer" }).click();
      const reset = resetForm(card);
      await reset.getByRole("checkbox", { name: /Confirmo volver al contenido original/ }).check();
      await reset.getByRole("button", { name: "Restablecer" }).click();
      // Reset deletes the row, so the card's controls (and the form that would show the success message) unmount:
      // the observable outcome is the card itself falling back to the original copy, not a message on a gone form.
      await expect(card).toContainText("Usando el contenido original", { timeout: SERVER_ACTION_TIMEOUT });
      expect(heroRowCount()).toBe("0");

      // 4. The web is back on the original copy within seconds too.
      await expect.poll(publicTitle, { timeout: 5_000, intervals: [250] }).toBe(original);
      await page.reload();
      await expect(card).toContainText("Usando el contenido original");
    } finally {
      restoreHero();
      await visitor.context().close();
    }
  });

  test("deactivating the edit leaves the original copy on the web without deleting the row", async ({ page, browser }) => {
    const visitor = await (await browser.newContext({ storageState: { cookies: [], origins: [] } })).newPage();
    const publicTitle = async () => {
      await visitor.reload();
      return (await visitor.locator("[data-home-hero] h1").textContent())?.trim() ?? "";
    };

    try {
      restoreHero();
      await visitor.goto("/parfums");
      const original = await publicTitle();

      await page.goto("/admin/contenido");
      const card = heroCard(page);
      await card.locator("summary").click();
      const form = saveForm(card);
      await form.locator('input[name="title"]').fill(HERO_TITLE);
      await form.getByRole("checkbox", { name: "Aplicar esta edición en la web" }).check();
      await form.getByRole("button", { name: "Guardar" }).click();
      await expect(feedback(form)).toHaveText("Contenido guardado.", { timeout: SERVER_ACTION_TIMEOUT });
      await expect.poll(publicTitle, { timeout: 5_000, intervals: [250] }).toBe(HERO_TITLE);

      // Deactivating is not deleting: the stored edit stays, the web falls back.
      await page.reload();
      const visibility = visibilityForm(card);
      await visibility.getByRole("button", { name: /Desactivar la edición/ }).click();
      await expect(feedback(visibility)).toHaveText("La web vuelve al contenido original.", { timeout: SERVER_ACTION_TIMEOUT });
      expect(heroRowCount()).toBe("1");
      await expect.poll(publicTitle, { timeout: 5_000, intervals: [250] }).toBe(original);

      // Reactivating brings the stored edit back without retyping it.
      await page.reload();
      await visibilityForm(card).getByRole("button", { name: /Activar la edición/ }).click();
      await expect(feedback(visibilityForm(card))).toHaveText("La web usa tu edición.", { timeout: SERVER_ACTION_TIMEOUT });
      await expect.poll(publicTitle, { timeout: 5_000, intervals: [250] }).toBe(HERO_TITLE);
    } finally {
      restoreHero();
      await visitor.context().close();
    }
  });

  test("the carousel speed set in the admin reaches the public rail", async ({ page, browser }) => {
    const visitor = await (await browser.newContext({ storageState: { cookies: [], origins: [] } })).newPage();
    const publicSpeed = async () => {
      await visitor.reload();
      return visitor.locator("[data-product-marquee]").getAttribute("data-marquee-speed");
    };

    try {
      restoreDestacados();
      await visitor.goto("/parfums");
      // The rail is always rendered (the seed has enough products to loop); with no block it drifts at the default.
      await expect(visitor.locator("[data-product-marquee]")).toHaveAttribute("data-marquee-speed", "40");

      // 1. The owner moves the speed slider from the admin.
      await page.goto("/admin/contenido");
      const card = carouselCard(page);
      await card.locator("summary").click();
      const form = saveForm(card);
      await setRange(form.locator('input[name="speed"]'), CAROUSEL_SPEED);
      await expect(form.locator('input[name="speed"]')).toHaveValue(String(CAROUSEL_SPEED));
      await form.getByRole("checkbox", { name: "Aplicar esta edición en la web" }).check();
      await form.getByRole("button", { name: "Guardar" }).click();
      await expect(feedback(form)).toHaveText("Contenido guardado.", { timeout: SERVER_ACTION_TIMEOUT });

      // 2. The public rail reflects the new speed within seconds.
      await expect.poll(publicSpeed, { timeout: 5_000, intervals: [250] }).toBe(String(CAROUSEL_SPEED));

      // 3. Restablecer deletes the row and the rail returns to the default speed.
      await page.reload();
      await expect(card).toContainText("Editado · aplicado en la web");
      await card.getByRole("button", { name: "Restablecer" }).click();
      const reset = resetForm(card);
      await reset.getByRole("checkbox", { name: /Confirmo volver al contenido original/ }).check();
      await reset.getByRole("button", { name: "Restablecer" }).click();
      await expect(card).toContainText("Usando el contenido original", { timeout: SERVER_ACTION_TIMEOUT });
      expect(destacadosRowCount()).toBe("0");
      await expect.poll(publicSpeed, { timeout: 5_000, intervals: [250] }).toBe("40");
    } finally {
      restoreDestacados();
      await visitor.context().close();
    }
  });
});

test.describe("Contenido web (solo lectura)", () => {
  test.skip(
    !LOCAL_DB_AVAILABLE || !hasIdentity("E2E_PARFUMS_VIEWER"),
    "requires the disposable local stack and the E2E_PARFUMS_VIEWER_* identity",
  );
  test.use({ storageState: PARFUMS_VIEWER_STATE, viewport: { width: 1280, height: 900 } });

  test("a viewer sees the copy but is never offered the editor", async ({ page }) => {
    await page.goto("/admin/contenido");
    const card = heroCard(page);
    await expect(card.locator("summary")).toHaveText("Ver contenido");
    await expect(card.getByRole("button", { name: "Guardar" })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Restablecer" })).toHaveCount(0);
    await expect(card).toContainText("Usando el contenido original");
  });
});
