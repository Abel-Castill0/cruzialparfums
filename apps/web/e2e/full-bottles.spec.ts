import { expect, test } from "@playwright/test";
import { LOCAL_DB_AVAILABLE, orderGiftProductId, orderSideEffects, testCustomerPhone } from "./local-db";

// Whole-bottle catalog (/parfums/frascos) and the free 2 ml Arabic gift at checkout. The fixtures this
// relies on live in scripts/local-browser-fixtures.sql (only on the disposable local stack): one Arabic
// perfume with a sealed bottle, one Arabic decant-only gift candidate and one excluded by the active rule.
const SERVER_ACTION_TIMEOUT = 15_000;
const GIFT_PRODUCT = "99005000-0000-4000-8000-000000000020";
const EXCLUDED_GIFT_PRODUCT = "99005000-0000-4000-8000-000000000030";

test.describe("whole bottles and the 2 ml gift", () => {
  test("the header links Perfumes enteros and the route lists only whole-bottle cards", async ({ page }) => {
    const response = await page.goto("/parfums/frascos");
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Frascos/i);
    // The nav entry exists in the header markup on every viewport (the mobile menu mirrors it).
    await expect(page.locator('a[href="/parfums/frascos"]').first()).toBeAttached();

    const cards = page.locator("[data-bottle-card]");
    const count = await cards.count();
    if (LOCAL_DB_AVAILABLE) expect(count, "required local whole-bottle fixture").toBeGreaterThan(0);
    test.skip(count === 0, "no whole-bottle products in this environment");
    await expect(cards.first()).toContainText(/Frasco completo/);
    await expect(cards.first().locator("[data-size-picker]")).toBeVisible();
    // The decant catalog's cards are never shown here.
    await expect(page.locator("[data-product-card]")).toHaveCount(0);
  });

  test("a whole bottle reaches the cart and the checkout as a sealed bottle", async ({ page }) => {
    await page.goto("/parfums/frascos");
    const cards = page.locator("[data-bottle-card]");
    const count = await cards.count();
    if (LOCAL_DB_AVAILABLE) expect(count, "required local whole-bottle fixture").toBeGreaterThan(0);
    test.skip(count === 0, "no whole-bottle products in this environment");
    await cards.first().getByRole("button", { name: /^Añadir/ }).click();
    await expect(page.getByRole("button", { name: /Abrir carrito, 1 producto/ })).toBeVisible();

    await page.goto("/parfums/checkout");
    await expect(page.locator("[data-checkout-total]")).not.toHaveText("S/ 0.00");
    await expect(page.locator("[data-cart-line]").first()).toContainText(/Frasco \d+ ml/);
  });

  test("the gift selector appears only with a full bottle and never offers the excluded perfume", async ({ page }) => {
    test.skip(!LOCAL_DB_AVAILABLE, "needs the disposable local stack fixtures");

    // A decant-only order: the free 2 ml gift does not apply, so there is no selector.
    await page.goto("/parfums/productos/local-qa-parfums");
    await page.getByRole("button", { name: /^Añadir/ }).click();
    await page.goto("/parfums/checkout");
    await expect(page.locator("[data-checkout-total]")).not.toHaveText("S/ 0.00");
    await expect(page.locator("[data-checkout-gift]")).toHaveCount(0);

    // With a full bottle, the Arabic candidates appear — minus the one the active rule excludes.
    await page.goto("/parfums/frascos");
    await page.locator("[data-bottle-card]").first().getByRole("button", { name: /^Añadir/ }).click();
    await page.goto("/parfums/checkout");
    await expect(page.locator("[data-checkout-total]")).not.toHaveText("S/ 0.00");
    const gift = page.locator("[data-checkout-gift] [data-gift-select]");
    await expect(gift).toBeVisible();
    const values = await gift.locator("option").evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    );
    expect(values).toContain(GIFT_PRODUCT);
    expect(values).not.toContain(EXCLUDED_GIFT_PRODUCT);
  });

  test("choosing the gift and submitting registers it on the order", async ({ page }) => {
    test.skip(process.env.E2E_ALLOW_ORDER_SUBMIT !== "1" || !LOCAL_DB_AVAILABLE, "needs the disposable local stack and the submit opt-in");
    const phone = testCustomerPhone(test.info());

    await page.goto("/parfums/frascos");
    await page.locator("[data-bottle-card]").first().getByRole("button", { name: /^Añadir/ }).click();
    await page.goto("/parfums/checkout");
    await expect(page.locator("[data-checkout-total]")).not.toHaveText("S/ 0.00");
    await page.locator("[data-checkout-gift] [data-gift-select]").selectOption(GIFT_PRODUCT);

    await page.locator("#checkout-name").fill("QA E2E Cruzial");
    await page.locator("#checkout-phone").fill(phone);
    const other = page.getByRole("radio", { name: /Mi agencia no aparece/ });
    await expect(async () => {
      await other.check({ timeout: 2_000 });
      await expect(other).toBeChecked({ timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
    await page.locator("#checkout-district").fill("Miraflores");
    await page.locator("[data-checkout-submit]").click();

    await expect(page).toHaveURL(/\/parfums\/gracias\/CRP-\d{8}-[A-F0-9]{12}$/, { timeout: SERVER_ACTION_TIMEOUT });
    expect(orderSideEffects(phone).orders).toBe(1);
    expect(orderGiftProductId(phone)).toBe(GIFT_PRODUCT);
  });
});
