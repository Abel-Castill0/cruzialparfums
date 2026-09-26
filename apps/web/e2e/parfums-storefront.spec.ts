import { expect, test, type Page } from "@playwright/test";
import { LOCAL_DB_AVAILABLE, orderSideEffects, provisionQaParfumsUnit } from "./local-db";

const ORDER_NUMBER = /CRP-\d{8}-[A-F0-9]{12}/;

function uniquePhone() {
  // 9 + 5 time digits + 3 random digits: unique across parallel projects.
  return `9${String(Date.now()).slice(-5)}${String(Math.floor(Math.random() * 1_000)).padStart(3, "0")}`;
}

async function checkoutWithQaProduct(page: Page, phone: string) {
  // Self-provisioning: this test adds exactly the tracked unit it reserves,
  // so desktop/mobile/parallel runs can never starve each other.
  if (LOCAL_DB_AVAILABLE) provisionQaParfumsUnit();
  await page.goto("/parfums/productos/local-qa-parfums");
  await page.getByRole("button", { name: /^Añadir/ }).click();
  await page.goto("/parfums/checkout");
  await expect(page.locator("[data-checkout-total]")).not.toHaveText("S/ 0.00");
  await fillCheckoutForm(page, phone);
}

async function fillCheckoutForm(page: Page, phone: string) {
  await page.locator("#checkout-name").fill("QA E2E Cruzial");
  await page.locator("#checkout-phone").fill(phone);
  await page.locator("#checkout-district").fill("Miraflores");
  await page.locator("#checkout-note").fill("[QA E2E] no despachar");
}

// Parfums storefront — database-truth surfaces, legacy URLs and the full
// order request. Runs on desktop and mobile projects.

test.describe("parfums storefront", () => {
  test("home renders the hero, discovery links and no placeholder sections", async ({ page }) => {
    const response = await page.goto("/parfums");
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Perfumería/);
    await expect(page.getByText(/Próximamente/)).toHaveCount(0);
    await expect(page.locator('a[href="#"]')).toHaveCount(0);
  });

  test("catalog lists published products with prices and working filters", async ({ page }) => {
    await page.goto("/parfums/catalogo");
    const cards = page.locator("[data-product-card]");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(0);
    await expect(cards.first()).toContainText(/S\/ \d/);

    await page.goto("/parfums/catalogo?type=designer");
    const designerCards = page.locator("[data-product-card]");
    if ((await designerCards.count()) > 0) {
      await expect(designerCards.first()).toContainText(/Designer/i);
    }
  });

  test("product detail shows presentations, quantity and consultation link", async ({ page }) => {
    await page.goto("/parfums/catalogo");
    const first = page.locator("[data-product-card] a[href^='/parfums/productos/']").first();
    const href = await first.getAttribute("href");
    expect(href).toBeTruthy();
    await page.goto(href!);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /Añadir al carrito/ })).toBeVisible();
    const consult = page.getByRole("link", { name: /Consultar/ }).first();
    await expect(consult).toHaveAttribute("href", /https:\/\/wa\.me\/\d+\?text=/);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
  });

  test("combos page lists published sets with their composition", async ({ page }) => {
    await page.goto("/parfums/combos");
    const sets = page.locator("[data-combo-card]");
    const count = await sets.count();
    test.skip(count === 0, "no published combos in this environment");
    await expect(sets.first().locator("li").first()).toBeVisible();
    await expect(sets.first()).toContainText(/S\/ \d/);
    await expect(page.getByText(/legacy/i)).toHaveCount(0);
  });

  test("wholesale page shows the confirmed per-category condition and a quote form", async ({ page }) => {
    await page.goto("/parfums/mayorista");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Mayor/);
    await expect(page.getByRole("button", { name: /Continuar en WhatsApp/ })).toBeVisible();
    await expect(page.getByText(/4\+ uds|12\+ uds|paridad legacy/)).toHaveCount(0);
  });

  test("institutional and legal pages load with real contact data", async ({ page }) => {
    for (const path of ["/parfums/nosotros", "/parfums/contacto", "/parfums/privacidad", "/parfums/terminos", "/parfums/finder"]) {
      const response = await page.goto(path);
      expect(response?.ok(), path).toBeTruthy();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
    await expect(page.locator('a[href^="https://wa.me/"]:visible').first()).toBeVisible();
  });

  test("unknown product and unknown route return 404 pages, not errors", async ({ page }) => {
    const missingProduct = await page.goto("/parfums/productos/this-does-not-exist");
    expect(missingProduct?.status()).toBe(404);
    const missingRoute = await page.goto("/parfums/no/such/page");
    expect(missingRoute?.status()).toBe(404);
  });

  test("legacy static URLs redirect to their V2 destinations", async ({ request }) => {
    const cases: Array<[string, string]> = [
      ["/index.html", "/parfums"],
      ["/catalog.html", "/parfums/catalogo"],
      ["/perfumes-enteros.html", "/parfums/mayorista"],
      ["/product.html?id=missing-legacy-id", "/parfums/catalogo"],
    ];
    for (const [from, to] of cases) {
      const response = await request.get(from, { maxRedirects: 0 });
      expect(response.status(), from).toBe(307);
      expect(response.headers()["location"], from).toContain(to);
    }
  });

  test("every HTML response carries the security headers", async ({ request }) => {
    const response = await request.get("/parfums");
    const headers = response.headers();
    expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(headers["content-security-policy"]).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  test("order request: cart -> checkout -> persisted reference -> WhatsApp handoff", async ({ page }) => {
    test.skip(process.env.E2E_ALLOW_ORDER_SUBMIT !== "1", "set E2E_ALLOW_ORDER_SUBMIT=1 against a disposable database");

    // The dedicated QA fixture product: every other catalog item's inventory
    // availability is realistic/mixed (some intentionally out_of_stock), and
    // since availability is enforced at persistence, an arbitrary catalog
    // card is not a reliable pick for a test that must always succeed.
    // Unique per test: the phone identity is rate limited (5 requests / hour).
    await checkoutWithQaProduct(page, uniquePhone());
    await page.locator("[data-checkout-submit]").click();

    await expect(page).toHaveURL(/\/parfums\/gracias\/CRP-\d{8}-[A-F0-9]{12}$/, { timeout: 15_000 });
    const reference = page.url().split("/").pop()!;
    const whatsapp = page.getByRole("link", { name: /Continuar por WhatsApp/ });
    await expect(whatsapp).toHaveAttribute("href", /https:\/\/wa\.me\/\d+\?text=/);
    const href = await whatsapp.getAttribute("href");
    expect(decodeURIComponent(href!)).toContain(reference);
  });

  test("lost response, reload, retry: the same browser gets the original order back, never a duplicate", async ({ page }) => {
    test.skip(process.env.E2E_ALLOW_ORDER_SUBMIT !== "1" || !LOCAL_DB_AVAILABLE, "needs the disposable local stack");
    const phone = uniquePhone();
    await checkoutWithQaProduct(page, phone);

    // Let the server COMMIT the order, then drop its response on the floor —
    // but only for the submission that carries the attempt capability (the
    // first one is the capability handshake and passes through untouched).
    let committed: string | null = null;
    await page.route("**/parfums/checkout", async (route) => {
      const request = route.request();
      const carriesAttempt = (await request.headerValue("cookie"))?.includes("cz_attempt_parfums_order=");
      if (request.method() !== "POST" || !carriesAttempt || committed) return route.continue();
      const response = await route.fetch();
      committed = (await response.text()).match(ORDER_NUMBER)?.[0] ?? null;
      await route.abort("connectionreset");
    });
    await page.locator("[data-checkout-submit]").click();
    await expect(page.locator("[data-checkout-form-panel] [role=alert]")).toContainText(/No pudimos conectar/);
    expect(committed).toMatch(ORDER_NUMBER);
    expect(orderSideEffects(phone)).toEqual({ orders: 1, outbox: 1, reservations: 1 });

    // The HttpOnly capability is never exposed to page script.
    expect(await page.evaluate(() => document.cookie)).not.toContain("cz_attempt");

    await page.unrouteAll();
    await page.reload();
    await expect(page.locator("[data-checkout-total]")).not.toHaveText("S/ 0.00");
    await fillCheckoutForm(page, phone);
    await page.locator("[data-checkout-submit]").click();

    await expect(page).toHaveURL(new RegExp(`/parfums/gracias/${committed}$`), { timeout: 15_000 });
    expect(orderSideEffects(phone)).toEqual({ orders: 1, outbox: 1, reservations: 1 });
  });

  test("a browser that cannot keep the attempt cookie fails closed before any order exists", async ({ page }) => {
    test.skip(process.env.E2E_ALLOW_ORDER_SUBMIT !== "1" || !LOCAL_DB_AVAILABLE, "needs the disposable local stack");
    const phone = uniquePhone();
    await checkoutWithQaProduct(page, phone);

    // Simulates a browser that refuses cookies. Deleting the request's Cookie
    // header is not faithful (Chromium re-attaches jar cookies after
    // interception), so instead every Set-Cookie is discarded: the jar is
    // cleared and the response is delivered without it, before the client
    // can make its single capability retry.
    await page.context().clearCookies();
    await page.route("**/parfums/checkout", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch();
      await page.context().clearCookies();
      const headers = { ...response.headers() };
      delete headers["set-cookie"];
      await route.fulfill({ response, headers });
    });
    await page.locator("[data-checkout-submit]").click();

    await expect(page.locator("[data-checkout-form-panel] [role=alert]")).toContainText(/Activa las cookies/);
    await expect(page).toHaveURL(/\/parfums\/checkout$/);
    expect(orderSideEffects(phone).orders).toBe(0);
  });
});
