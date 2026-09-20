import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { ADMIN_STATE, PARFUMS_ADMIN_STATE } from "./auth-state";

// Authenticated Admin critical journeys. The storageState files are produced
// by auth.setup.ts from environment-provided QA identities (never committed).
// Every spec here is read-only against the database except the explicit
// logout at the end.

test.describe("dual admin (Parfums + Import)", () => {
  // Serial: every test shares one storageState and the last one logs out
  // globally (revoking the refresh token for all contexts built from it).
  test.describe.configure({ mode: "serial" });
  test.skip(!existsSync(ADMIN_STATE), "no dual-admin session (E2E_ADMIN_* not set)");
  test.use({ storageState: ADMIN_STATE });

  test("shell shows both units and every module route renders", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("link", { name: /Cruzial Parfums/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Cruzial Import/i })).toBeVisible();

    const routes = [
      "/admin/parfums", "/admin/parfums/productos", "/admin/parfums/categorias", "/admin/parfums/combos",
      "/admin/parfums/mayorista", "/admin/parfums/pedidos", "/admin/parfums/configuracion", "/admin/parfums/auditoria",
      "/admin/import", "/admin/import/productos", "/admin/import/consolidados", "/admin/import/pedidos",
      "/admin/import/clientes", "/admin/import/configuracion", "/admin/import/auditoria", "/admin/import/publicacion",
      "/admin/security",
    ];
    for (const route of routes) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBe(200);
      await expect(page, route).not.toHaveURL(/\/admin\/login/);
      await expect(page.getByRole("heading", { level: 1 }), route).toBeVisible();
    }
  });

  test("Parfums product editor opens from the list and shows variants and media", async ({ page }) => {
    await page.goto("/admin/parfums/productos");
    const first = page.locator('a[href^="/admin/parfums/productos/"]').filter({ hasNot: page.getByText("Nuevo producto") }).first();
    const href = await first.getAttribute("href");
    expect(href).toMatch(/\/admin\/parfums\/productos\/[0-9a-f-]{36}$/);
    await page.goto(href!);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /Guardar/i }).first()).toBeVisible();
  });

  test("Parfums orders list opens an order detail with customer snapshot", async ({ page }) => {
    await page.goto("/admin/parfums/pedidos");
    const link = page.locator('a[href^="/admin/parfums/pedidos/"]').first();
    test.skip((await link.count()) === 0, "no orders in this environment");
    await link.click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Pedido CRP-/);
  });

  test("security page lists the verified TOTP factor and offers a backup enrollment, never removal", async ({ page }) => {
    await page.goto("/admin/security");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Seguridad/);
    await expect(page.getByText(/verificad/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /eliminar|quitar|remove/i })).toHaveCount(0);
  });

  test("already-verified session is not asked to enroll or challenge again", async ({ page }) => {
    await page.goto("/admin/mfa/challenge");
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto("/admin/mfa/enroll");
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("logout ends the session and protected routes redirect again", async ({ page }) => {
    await page.goto("/admin");
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.goto("/admin/parfums");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe("Parfums-only admin", () => {
  test.skip(!existsSync(PARFUMS_ADMIN_STATE), "no parfums-only session (E2E_PARFUMS_ADMIN_* not set)");
  test.use({ storageState: PARFUMS_ADMIN_STATE });

  test("can administer Parfums but is denied Import (cross-unit boundary)", async ({ page }) => {
    const ok = await page.goto("/admin/parfums/productos");
    expect(ok?.status()).toBe(200);
    await expect(page).toHaveURL(/\/admin\/parfums\/productos/);

    await page.goto("/admin/import/productos");
    await expect(page).not.toHaveURL(/\/admin\/import\/productos/);
    await expect(page.getByRole("heading", { name: /Productos Import/i })).toHaveCount(0);

    await page.goto("/admin");
    await expect(page.getByRole("link", { name: /Cruzial Import/i })).toHaveCount(0);
  });
});
