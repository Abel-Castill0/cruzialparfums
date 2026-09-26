import { expect, test, type Page } from "@playwright/test";
import { LOCAL_DB_AVAILABLE, orderSideEffects, provisionQaParfumsUnit, testCustomerPhone } from "./local-db";

const ORDER_NUMBER = /CRP-\d{8}-[A-F0-9]{12}/;

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
    await checkoutWithQaProduct(page, testCustomerPhone(test.info()));
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
    const phone = testCustomerPhone(test.info());
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

    // The retry resolves the unknown outcome truthfully: the ORIGINAL order,
    // explicitly labelled as already registered — never a new purchase.
    const held = page.locator('[data-attempt-held="replayed"]');
    await expect(held).toContainText(committed!);
    await expect(held).toContainText(/No se creó una solicitud nueva/);
    expect(orderSideEffects(phone)).toEqual({ orders: 1, outbox: 1, reservations: 1 });
    await held.locator("[data-attempt-view]").click();
    await expect(page).toHaveURL(new RegExp(`/parfums/gracias/${committed}$`), { timeout: 15_000 });
    expect(orderSideEffects(phone)).toEqual({ orders: 1, outbox: 1, reservations: 1 });
  });

  test("a browser that cannot keep the attempt cookie fails closed before any order exists", async ({ page }) => {
    test.skip(process.env.E2E_ALLOW_ORDER_SUBMIT !== "1" || !LOCAL_DB_AVAILABLE, "needs the disposable local stack");
    const phone = testCustomerPhone(test.info());
    await checkoutWithQaProduct(page, phone);

    // Simulates a browser that refuses cookies. Deleting the request's Cookie
    // header is not faithful (Chromium re-attaches jar cookies after
    // interception), so instead every Set-Cookie is discarded: the jar is
    // cleared and the response is delivered without it, before the client
    // can make its single capability retry.
    await page.context().clearCookies();
    const postsWithCapability: boolean[] = [];
    const issued: boolean[] = [];
    await page.route("**/parfums/checkout", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      postsWithCapability.push(Boolean((await route.request().headerValue("cookie"))?.includes("cz_attempt_")));
      const response = await route.fetch();
      issued.push(Boolean(response.headers()["set-cookie"]?.includes("cz_attempt_parfums_order=")));
      await page.context().clearCookies();
      const headers = { ...response.headers() };
      delete headers["set-cookie"];
      await route.fulfill({ response, headers });
    });
    await page.locator("[data-checkout-submit]").click();

    await expect(page.locator("[data-checkout-form-panel] [role=alert]")).toContainText(/Activa las cookies/);
    await expect(page).toHaveURL(/\/parfums\/checkout$/);
    // First attempt issued a capability the browser could not retain; the
    // single automatic retry still carried none; nothing was persisted.
    expect(issued).toEqual([true, true]);
    expect(postsWithCapability).toEqual([false, false]);
    expect(await page.context().cookies()).toEqual([]);
    expect(orderSideEffects(phone)).toEqual({ orders: 0, outbox: 0, reservations: 0 });
  });

  test("an expired capability never mutates on its own; only an explicit new request does", async ({ page, baseURL }) => {
    test.skip(process.env.E2E_ALLOW_ORDER_SUBMIT !== "1" || !LOCAL_DB_AVAILABLE, "needs the disposable local stack");
    const phone = testCustomerPhone(test.info());
    await checkoutWithQaProduct(page, phone);
    const threeDaysAgo = Math.floor(Date.now() / 1000) - 3 * 24 * 60 * 60;
    const expired = `v1.${"E".repeat(43)}.${threeDaysAgo}`;
    // Exactly the cookie the server issues (same name, host and path).
    await page.context().addCookies([{ name: "cz_attempt_parfums_order", value: expired,
      domain: new URL(baseURL!).hostname, path: "/parfums/checkout", httpOnly: true, sameSite: "Strict" }]);

    for (let i = 0; i < 2; i++) {
      await page.locator("[data-checkout-submit]").click();
      await expect(page.locator("[data-checkout-form-panel] [role=alert]")).toContainText(/venció/);
    }
    expect(orderSideEffects(phone)).toEqual({ orders: 0, outbox: 0, reservations: 0 });
    // The expired capability is kept (not silently replaced by a fresh one).
    const kept = (await page.context().cookies()).find((cookie) => cookie.name === "cz_attempt_parfums_order");
    expect(kept?.value).toBe(expired);

    await page.locator("[data-checkout-form-panel] [data-attempt-new]").click();
    await expect(page).toHaveURL(/\/parfums\/gracias\/CRP-\d{8}-[A-F0-9]{12}$/, { timeout: 15_000 });
    expect(orderSideEffects(phone)).toEqual({ orders: 1, outbox: 1, reservations: 1 });
  });

  test("success whose rotation fails (storage blocked) keeps the success state; a later purchase is never a silent replay", async ({ page }) => {
    test.skip(process.env.E2E_ALLOW_ORDER_SUBMIT !== "1" || !LOCAL_DB_AVAILABLE, "needs the disposable local stack");
    const phone = testCustomerPhone(test.info());
    await checkoutWithQaProduct(page, phone);
    // Browser storage writes are blocked on checkout: correctness must not
    // depend on them.
    await page.addInitScript(() => {
      if (!location.pathname.startsWith("/parfums/checkout")) return;
      Storage.prototype.setItem = () => { throw new DOMException("blocked", "SecurityError"); };
    });
    await page.reload();
    await fillCheckoutForm(page, phone);

    // Every rotation call (the argument-less server action) fails at the
    // network layer; order submissions pass.
    let blockRotation = true;
    await page.route("**/parfums/checkout", async (route) => {
      const request = route.request();
      const isRotation = request.method() === "POST" && request.headers()["next-action"] !== undefined
        && !(request.postData() ?? "").includes("\"lines\"");
      if (isRotation && blockRotation) return route.abort("failed");
      return route.continue();
    });
    await page.locator("[data-checkout-submit]").click();

    const rotationFailed = page.locator('[data-attempt-held="rotation_failed"]');
    await expect(rotationFailed).toContainText(ORDER_NUMBER);
    const first = (await rotationFailed.textContent())!.match(ORDER_NUMBER)![0];
    await expect(page).toHaveURL(/\/parfums\/checkout$/);
    await expect(page.locator("[data-checkout-submit]")).toBeDisabled();
    expect(orderSideEffects(phone)).toEqual({ orders: 1, outbox: 1, reservations: 1 });

    // Reload while rotation still fails: the old, completed capability is
    // still in the jar. A new submit is reported as the SAME registered
    // order — never a second order, never a silent "new" purchase.
    await page.reload();
    await expect(page.locator("[data-checkout-total]")).not.toHaveText("S/ 0.00");
    await fillCheckoutForm(page, phone);
    await page.locator("[data-checkout-submit]").click();
    const replayed = page.locator('[data-attempt-held="replayed"]');
    await expect(replayed).toContainText(first);
    expect(orderSideEffects(phone)).toEqual({ orders: 1, outbox: 1, reservations: 1 });

    // Explicit new purchase once rotation works again: a different order
    // under a different attempt identity; the first stays exactly one row.
    blockRotation = false;
    provisionQaParfumsUnit();
    await replayed.locator("[data-attempt-new]").click();
    await expect(page).toHaveURL(/\/parfums\/gracias\/CRP-\d{8}-[A-F0-9]{12}$/, { timeout: 15_000 });
    expect(page.url()).not.toContain(first);
    expect(orderSideEffects(phone)).toEqual({ orders: 2, outbox: 2, reservations: 2 });
  });
});
