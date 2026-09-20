import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";

// 4J5G-B — Authenticated Admin critical E2E.
// Reuses a locally-created, gitignored Playwright storageState
// (e2e/.auth/staging-admin.json) obtained via manual operator login — Claude
// never handles the password. Covers dual-admin (parfums + import) runtime
// regression only; membership-boundary behavior was proven manually in 4J5F.

const STAGING_STATE = "e2e/.auth/staging-admin.json";

test.describe("authenticated admin", () => {
  // Hosted-staging-only: relies on the [STAGING QA] fixtures and a manually
  // captured storageState. Skips everywhere else (see admin-critical.spec.ts
  // for the environment-agnostic authenticated journeys).
  test.skip(!existsSync(STAGING_STATE), "no staging storageState captured");
  test.use({ storageState: STAGING_STATE });

  test("admin shell shows both business units for a dual-admin member", async ({ page }) => {
    const response = await page.goto("/admin");
    expect(response?.ok()).toBeTruthy();
    await expect(page).not.toHaveURL(/\/admin\/login$/);

    await expect(page.getByRole("link", { name: /Cruzial Parfums/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Cruzial Import/i })).toBeVisible();
  });

  test("Parfums admin: QA product opens from catalog", async ({ page }) => {
    await page.goto("/admin/parfums/productos?q=staging-qa-publishable");
    await expect(page).not.toHaveURL(/\/admin\/login$/);

    const list = page.getByRole("list", { name: "Lista de productos" });
    const productLink = list.getByRole("link").first();
    await expect(productLink).toBeVisible();
    await productLink.click();

    await expect(page).toHaveURL(/\/admin\/parfums\/productos\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("Import admin: publication readiness reflects deterministic QA fixtures", async ({ page }) => {
    await page.goto("/admin/import/publicacion?q=staging-qa-import-ready");
    await expect(page).not.toHaveURL(/\/admin\/login$/);
    await expect(page.getByText("No hay bloqueadores")).toBeVisible();

    await page.goto("/admin/import/publicacion?q=staging-qa-import-no-media");
    const mediaRow = page.getByRole("row", { name: /Sin imagen principal/ });
    await expect(mediaRow).toHaveCount(1);

    await page.goto("/admin/import/publicacion?q=staging-qa-import-no-offer");
    const offerRow = page.getByRole("row", { name: /Sin oferta en consolidado/ });
    await expect(offerRow).toHaveCount(1);
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
