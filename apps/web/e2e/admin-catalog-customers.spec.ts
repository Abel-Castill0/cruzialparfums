import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { GATE_B_ADMIN_STATE, PARFUMS_ADMIN_STATE, hasIdentity } from "./auth-state";

// Phase B2A — read-only authenticated checks of the catalog and customer
// workspaces against the disposable local fixtures (scripts/local-*-fixtures.sql).
// Checks every required width (1440–360) for page-level horizontal overflow.
// Gated on the runner identity + local fixtures (never on storageState files,
// which do not exist at collection time). Uses the Gate B identity because the
// dual-admin suite in admin-critical.spec.ts ends with a global logout.

const ids = {
  parfumsProduct: "99002000-0000-4000-8000-000000000001",
  importProduct: "99001000-0000-4000-8000-000000000002",
  openCampaign: "99001000-0000-4000-8000-000000000004",
};

async function expectAccessibleAndContained(page: Page, testInfo: TestInfo) {
  for (const width of [1440, 1280, 1024, 768, 430, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);
  }
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const advisory = results.violations.filter((v) => v.impact === "moderate" || v.impact === "minor");
  if (advisory.length) {
    testInfo.annotations.push({ type: "axe-advisory", description: advisory.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}`).join("; ") });
  }
  expect(blocking.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
}

test.describe("B2A catalog and customer workspaces (admin)", () => {
  test.skip(process.env.E2E_LOCAL_FIXTURES !== "1" || !hasIdentity("E2E_GATE_B_ADMIN"), "requires disposable local fixtures and the E2E_GATE_B_ADMIN_* identity");
  test.use({ storageState: GATE_B_ADMIN_STATE });

  test("Parfums product list is a task-oriented catalog", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/admin/parfums/productos");
    await expect(page.getByRole("heading", { level: 1, name: "Productos" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Ver productos por estado" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Agregar producto/ })).toBeVisible();
    await expect(page.getByRole("list", { name: "Lista de productos" }).getByRole("link").first()).toBeVisible();
    await expectAccessibleAndContained(page, testInfo);
  });

  test("Parfums product workspace explains storefront visibility from the storefront mapper", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/admin/parfums/productos/${ids.parfumsProduct}`);
    await expect(page.getByRole("heading", { name: "Qué ven tus clientes" })).toBeVisible();
    await expect(page.getByText("Visible en la tienda", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Preparación del producto" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Presentaciones y precios/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Fotos/ })).toBeVisible();
    // An admin always sees either the upload area or the explicit reason it is
    // unavailable (no Cloudinary credentials here); never a silent gap.
    await expect(page.locator("[data-media-dropzone], [data-media-unconfigured]")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Categorías" })).toBeVisible();
    await expectAccessibleAndContained(page, testInfo);
  });

  test("Import product list keeps the selected consolidado explicit", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/admin/import/productos?campaign=${ids.openCampaign}`);
    await expect(page.getByRole("heading", { name: "Consolidado que estás revisando" })).toBeVisible();
    await expect(page.getByText(/Consolidado #9901/).first()).toBeVisible();
    await expect(page.getByRole("list", { name: "Lista de productos Import" })).toBeVisible();
    const productLink = page.getByRole("list", { name: "Lista de productos Import" }).getByRole("link", { name: /LOCAL QA — Producto de prueba/ });
    await expect(productLink).toHaveAttribute("href", new RegExp(`campaign=${ids.openCampaign}`));
    await expectAccessibleAndContained(page, testInfo);
  });

  test("Import product workspace separates global data from this consolidado", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/admin/import/productos/${ids.importProduct}?campaign=${ids.openCampaign}`);
    await expect(page.getByText("Visible en el Consolidado #9901", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Datos del producto" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "En Consolidado #9901" })).toBeVisible();
    await expect(page.getByText("Cambiar el precio o la disponibilidad aquí no modifica el producto ni otros consolidados.")).toBeVisible();
    await expectAccessibleAndContained(page, testInfo);
  });

  test("Import customers list and detail explain verification and deposit", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/admin/import/clientes?archived=all");
    await expect(page.getByRole("heading", { level: 1, name: "Clientes" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Ver clientes por estado" })).toBeVisible();
    await expectAccessibleAndContained(page, testInfo);

    const first = page.getByRole("list", { name: "Lista de clientes" }).getByRole("link").first();
    test.skip((await first.count()) === 0, "no customers in this environment");
    await page.setViewportSize({ width: 1280, height: 900 });
    await first.click();
    await expect(page.getByRole("heading", { name: "Verificación y depósito" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Datos de contacto" })).toBeVisible();
    await expectAccessibleAndContained(page, testInfo);
  });
});

test.describe("B2A Parfums-only admin boundary", () => {
  test.skip(!hasIdentity("E2E_PARFUMS_ADMIN"), "no parfums-only identity (E2E_PARFUMS_ADMIN_* not set)");
  test.use({ storageState: PARFUMS_ADMIN_STATE });

  test("a Parfums-only admin cannot open Import customers or products", async ({ page }) => {
    await page.goto("/admin/import/clientes");
    await expect(page).not.toHaveURL(/\/admin\/import\/clientes/);
    await page.goto(`/admin/import/productos/${ids.importProduct}`);
    await expect(page).not.toHaveURL(/\/admin\/import\/productos/);
  });
});
