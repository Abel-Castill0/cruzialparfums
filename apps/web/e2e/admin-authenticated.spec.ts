import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { ADMIN_STATE, hasIdentity } from "./auth-state";

// 4J5G-B — Authenticated Admin critical E2E (dual-unit member: Parfums + Import).
// Runs with the synthetic dual-admin identity the browser runners mint (real password + TOTP, AAL2):
// scripts/local-admin-browser.mjs (local stack) and scripts/qa-hosted-browser.mjs (hosted QA project).
// An operator-captured storageState (e2e/.auth/staging-admin.json) is still honoured when present, for a
// hosted target the runners cannot mint identities in. Fixtures: scripts/local-browser-fixtures.sql.

const OPERATOR_STATE = "e2e/.auth/staging-admin.json";
const RUNNER_IDENTITY = hasIdentity("E2E_ADMIN");
const STATE = RUNNER_IDENTITY ? ADMIN_STATE : OPERATOR_STATE;
const READINESS_CAMPAIGN = "99004000-0000-4000-8000-000000000001";

test.describe("authenticated admin", () => {
  test.skip(!RUNNER_IDENTITY && !existsSync(OPERATOR_STATE), "no runner identity and no operator storageState");
  test.use({ storageState: STATE });

  test("admin shell shows both business units for a dual-admin member", async ({ page }) => {
    const response = await page.goto("/admin");
    expect(response?.ok()).toBeTruthy();
    await expect(page).not.toHaveURL(/\/admin\/login$/);

    await expect(page.getByRole("link", { name: /Cruzial Parfums/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Cruzial Import/i })).toBeVisible();
  });

  test("Parfums admin: QA product opens from catalog", async ({ page }) => {
    await page.goto("/admin/parfums/productos?q=local-qa-parfums");
    await expect(page).not.toHaveURL(/\/admin\/login$/);

    const list = page.getByRole("list", { name: "Lista de productos" });
    const productLink = list.getByRole("link").first();
    await expect(productLink).toBeVisible();
    await productLink.click();

    await expect(page).toHaveURL(/\/admin\/parfums\/productos\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("Import admin: publication readiness reflects deterministic QA fixtures", async ({ page }) => {
    const readiness = (slug: string) => `/admin/import/publicacion?campaign=${READINESS_CAMPAIGN}&q=${slug}`;
    await page.goto(readiness("local-qa-import-ready"));
    await expect(page).not.toHaveURL(/\/admin\/login$/);
    await expect(page.getByText(/No hay bloqueadores/)).toBeVisible();

    await page.goto(readiness("local-qa-import-no-media"));
    await expect(page.getByRole("row", { name: /Falta imagen principal/ })).toHaveCount(1);

    await page.goto(readiness("local-qa-import-no-offer"));
    await expect(page.getByRole("row", { name: /Sin precio en este consolidado/ })).toHaveCount(1);
  });

  test("authenticated session survives navigation and reload", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin\/login$/);

    await page.getByRole("link", { name: /Cruzial Parfums/i }).click();
    await expect(page).toHaveURL(/\/admin\/parfums$/);

    await page.goto("/admin/import");
    await expect(page).not.toHaveURL(/\/admin\/login$/);

    await page.reload();
    await expect(page).not.toHaveURL(/\/admin\/login$/);
  });
});
