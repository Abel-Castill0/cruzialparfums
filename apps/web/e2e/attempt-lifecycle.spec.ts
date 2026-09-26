import { expect, test, type Page } from "@playwright/test";
import { LOCAL_DB_AVAILABLE, complaintSideEffects, orderSideEffects, testCustomerPhone } from "./local-db";

// Anonymous attempt lifecycle for the Import order and Libro de Reclamaciones
// flows (the Parfums flow is covered in parfums-storefront.spec.ts). Local
// disposable stack only: every assertion is scoped to this test's own
// deterministic synthetic phone.

const IMPORT_ORDER = /CRI-\d{8}-[A-F0-9]{12}|[A-Z]{3}-\d{8}-[A-F0-9]{12}/;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

async function fillComplaint(page: Page, phone: string) {
  await page.locator('input[name="fullName"]').fill("QA E2E Reclamo");
  await page.locator('input[name="documentNumber"]').fill("12345678");
  await page.locator('input[name="address"]').fill("Av. QA 123, Lima");
  await page.locator('input[name="phone"]').fill(phone);
  await page.locator('input[name="email"]').fill("qa-e2e@example.test");
  await page.locator('textarea[name="detail"]').fill("[QA E2E] detalle sintético de prueba, no atender.");
  await page.locator('textarea[name="consumerRequest"]').fill("[QA E2E] solicitud sintética.");
}

test.describe("attempt lifecycle — Libro de Reclamaciones", () => {
  test.skip(() => process.env.E2E_ALLOW_ORDER_SUBMIT !== "1" || !LOCAL_DB_AVAILABLE, "needs the disposable local stack");

  test("lost response + reload: the retry shows the SAME complaint as already registered, never a second one", async ({ page }) => {
    const phone = testCustomerPhone(test.info());
    await page.goto("/libro-de-reclamaciones");
    await fillComplaint(page, phone);
    let committed: string | null = null;
    await page.route("**/libro-de-reclamaciones**", async (route) => {
      const request = route.request();
      const carriesAttempt = (await request.headerValue("cookie"))?.includes("cz_attempt_complaint=");
      if (request.method() !== "POST" || !carriesAttempt || committed) return route.continue();
      const response = await route.fetch();
      committed = (await response.text()).match(UUID)?.[0] ?? null;
      await route.abort("connectionreset");
    });
    await page.getByRole("button", { name: "Registrar solicitud" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /No se pudo confirmar el envío/ })).toBeVisible();
    expect(complaintSideEffects(phone).complaints).toBe(1);

    await page.unrouteAll();
    await page.reload();
    await fillComplaint(page, phone);
    await page.getByRole("button", { name: "Registrar solicitud" }).click();
    const held = page.locator('[data-attempt-held="replayed"]');
    await expect(held).toContainText(/ya estaba registrada/);
    expect(complaintSideEffects(phone).complaints).toBe(1);

    await held.locator("[data-attempt-view]").click();
    await expect(page.getByRole("heading", { name: "Tu solicitud fue registrada." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Imprimir / Guardar copia" })).toBeVisible();
    expect(complaintSideEffects(phone).complaints).toBe(1);
  });

  test("an expired complaint capability cannot duplicate silently; explicit new request registers exactly one", async ({ page, baseURL }) => {
    const phone = testCustomerPhone(test.info());
    await page.goto("/libro-de-reclamaciones");
    const expired = `v1.${"C".repeat(43)}.${Math.floor(Date.now() / 1000) - 3 * 24 * 60 * 60}`;
    await page.context().addCookies([{ name: "cz_attempt_complaint", value: expired,
      domain: new URL(baseURL!).hostname, path: "/libro-de-reclamaciones", httpOnly: true, sameSite: "Strict" }]);
    await fillComplaint(page, phone);
    await page.getByRole("button", { name: "Registrar solicitud" }).click();
    const alert = page.getByRole("alert").filter({ hasText: /venció/ });
    await expect(alert).toBeVisible();
    expect(complaintSideEffects(phone)).toEqual({ complaints: 0, outbox: 0 });

    await alert.locator("[data-attempt-new]").click();
    await expect(page.getByRole("heading", { name: "Tu solicitud fue registrada." })).toBeVisible();
    expect(complaintSideEffects(phone).complaints).toBe(1);
  });
});

test.describe("attempt lifecycle — Import order", () => {
  test.skip(() => process.env.E2E_ALLOW_ORDER_SUBMIT !== "1" || !LOCAL_DB_AVAILABLE, "needs the disposable local stack");

  test("lost response + reload: the retry reports the SAME order as already registered", async ({ page }) => {
    await page.goto("/import");
    const add = page.getByRole("button", { name: "Agregar al carrito" }).first();
    test.skip(!(await add.isVisible().catch(() => false)), "local fixture has no open Import campaign with products");
    await add.click();
    await page.goto("/import/checkout");
    const phone = testCustomerPhone(test.info());
    const fill = async () => {
      await page.locator("#checkout-name").fill("QA E2E Import");
      await page.locator("#checkout-phone").fill(phone);
      await page.locator("#checkout-district").fill("Miraflores");
      await page.locator("#checkout-address").fill("[QA E2E] no despachar");
    };
    await fill();
    let committed: string | null = null;
    await page.route("**/import/checkout", async (route) => {
      const request = route.request();
      const carriesAttempt = (await request.headerValue("cookie"))?.includes("cz_attempt_import_order=");
      if (request.method() !== "POST" || !carriesAttempt || committed) return route.continue();
      const response = await route.fetch();
      committed = (await response.text()).match(IMPORT_ORDER)?.[0] ?? null;
      await route.abort("connectionreset");
    });
    await page.locator('form button[type="submit"]').click();
    await expect(page.getByRole("alert").filter({ hasText: /No pudimos conectar/ })).toBeVisible();
    expect(committed).toMatch(IMPORT_ORDER);
    expect(orderSideEffects(phone).orders).toBe(1);

    await page.unrouteAll();
    await page.reload();
    await fill();
    await page.locator('form button[type="submit"]').click();
    const held = page.locator('[data-attempt-held="replayed"]');
    await expect(held).toContainText(committed!);
    expect(orderSideEffects(phone).orders).toBe(1);
    await held.locator("[data-attempt-view]").click();
    await expect(page.locator("#success-title")).toBeVisible();
    expect(orderSideEffects(phone).orders).toBe(1);
  });
});
