import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { GATE_B_ADMIN_STATE, PARFUMS_VIEWER_STATE, hasIdentity } from "./auth-state";

// Phase B2B — authenticated checks of Combos and Mayorista against the
// disposable local fixtures (scripts/local-browser-fixtures.sql, "Phase B2B").
// Gated on the runner identity + local fixtures (never on storageState files,
// which do not exist at collection time). Mutations only ever touch the
// disposable "Set editable" combo, and the wholesale policy save re-submits
// the stored values (no business value changes; nothing is disabled).

const ids = {
  officialCombo: "99002000-0000-4000-8000-000000000024",
  officialComboProduct: "99002000-0000-4000-8000-000000000021",
  visibleCombo: "99002000-0000-4000-8000-000000000014",
  editableCombo: "99002000-0000-4000-8000-000000000034",
};

const LOCAL_ONLY = process.env.E2E_LOCAL_FIXTURES !== "1";

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

test.describe("B2B combos and Mayorista (admin)", () => {
  test.skip(LOCAL_ONLY || !hasIdentity("E2E_GATE_B_ADMIN"), "requires disposable local fixtures and the E2E_GATE_B_ADMIN_* identity");
  test.use({ storageState: GATE_B_ADMIN_STATE });

  test("combo list prioritizes name, visibility and verification", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/admin/parfums/combos");
    await expect(page.getByRole("heading", { level: 1, name: "Combos" })).toBeVisible();
    await expect(page.getByText("Administra los sets que aparecen en Cruzial Parfums.")).toBeVisible();
    await expect(page.getByRole("link", { name: /Crear combo/ })).toBeVisible();
    const list = page.getByRole("list", { name: "Lista de combos" });
    const official = list.getByRole("link", { name: /LOCAL QA — Set oficial/ });
    await expect(official).toBeVisible();
    await expect(official).toContainText("Verificada · fuente oficial");
    await expect(official).toContainText("No visible");
    await expect(official).toContainText("El producto del combo no está publicado.");
    await expect(official).not.toContainText("local-qa-b2b-set-oficial");
    await expect(list.getByRole("link", { name: /LOCAL QA — Set de prueba/ })).toContainText("Puede aparecer en la tienda");
    await expectAccessibleAndContained(page, testInfo);
  });

  test("official_pdf combo explains visibility, next step, product vs combo and composition", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/admin/parfums/combos/${ids.officialCombo}`);
    await expect(page.getByRole("heading", { level: 1, name: "LOCAL QA — Set oficial" })).toBeVisible();

    const summary = page.getByRole("region", { name: "Qué ven tus clientes" });
    await expect(summary.getByText("Este combo todavía no puede aparecer en la tienda.")).toBeVisible();
    await expect(summary.getByText("El producto del combo no está publicado.")).toBeVisible();
    await expect(summary.getByText("Publica el producto del combo")).toBeVisible();
    await expect(summary.getByRole("link", { name: /Abrir producto/ })).toHaveAttribute("href", `/admin/parfums/productos/${ids.officialComboProduct}`);

    await expect(page.getByText("Nombre, precio, fotos y publicación pertenecen al producto del combo.", { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: /Editar producto/ })).toHaveAttribute("href", `/admin/parfums/productos/${ids.officialComboProduct}`);

    const verification = page.getByRole("region", { name: "Verificación de la composición" });
    await expect(verification.getByText("Verificada por fuente oficial", { exact: true })).toBeVisible();
    await expect(verification.getByText("Este estado proviene de una fuente autorizada y no se cambia manualmente.")).toBeVisible();
    await expect(verification.getByRole("radio")).toHaveCount(0);
    await expect(verification.getByRole("combobox")).toHaveCount(0);
    await expect(verification.getByRole("button", { name: "Guardar verificación" })).toHaveCount(0);

    const composition = page.getByRole("region", { name: "Composición", exact: true });
    await expect(composition.getByRole("heading", { level: 3, name: "LOCAL QA Set 3 ml" })).toBeVisible();
    await expect(composition.getByRole("heading", { level: 3, name: "LOCAL QA Set 5 ml" })).toBeVisible();
    await expect(composition.getByRole("list", { name: "Contenido de LOCAL QA Set 3 ml" }).getByRole("listitem")).toHaveCount(2);
    await expect(composition.getByRole("list", { name: "Contenido de LOCAL QA Set 5 ml" }).getByRole("listitem")).toHaveCount(1);
    await expect(composition.getByRole("spinbutton", { name: /Cantidad de LOCAL QA — Producto de prueba/ }).last()).toHaveValue("2");
    await expect(composition).not.toContainText(ids.officialCombo);
    await expectAccessibleAndContained(page, testInfo);
  });

  test("a combo that meets every condition says so", async ({ page }) => {
    await page.goto(`/admin/parfums/combos/${ids.visibleCombo}`);
    const summary = page.getByRole("region", { name: "Qué ven tus clientes" });
    await expect(summary.getByText("Este combo cumple las condiciones para aparecer en el catálogo.")).toBeVisible();
    await expect(page.getByText("Nada pendiente")).toBeVisible();
    await expect(page.getByText("Composición confirmada por cliente").first()).toBeVisible();
  });

  test("new combo keeps pending_reconfirmation as default and client confirmation explicit", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/admin/parfums/combos/nuevo");
    await expect(page.getByRole("heading", { level: 1, name: "Crear combo" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Pasos para crear un combo" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Necesita reconfirmación/ })).toBeChecked();
    await expect(page.getByRole("radio", { name: /Composición confirmada por cliente/ })).not.toBeChecked();
    await page.getByRole("radio", { name: /Composición confirmada por cliente/ }).check();
    const submit = page.getByRole("button", { name: "Crear combo" });
    await expect(submit).toBeDisabled();
    await page.getByRole("checkbox", { name: /el cliente aprobó la composición/ }).check();
    await expect(submit).toBeEnabled();
    await page.getByRole("radio", { name: /Necesita reconfirmación/ }).check();
    await expectAccessibleAndContained(page, testInfo);
  });

  test("editing one combo section never leaves another holding a stale token", async ({ page }) => {
    await page.goto(`/admin/parfums/combos/${ids.editableCombo}`);
    const composition = page.getByRole("region", { name: "Composición", exact: true });
    const verification = page.getByRole("region", { name: "Verificación de la composición" });
    const quantity = composition.getByRole("spinbutton", { name: /Cantidad de LOCAL QA — Producto de prueba/ });
    const saveComposition = composition.getByRole("button", { name: "Guardar composición" });

    // 1. Composition: local edit is explicit until saved.
    const before = await quantity.inputValue();
    await quantity.fill(before === "1" ? "2" : "1");
    await expect(composition.getByText("Cambios sin guardar en la composición")).toBeVisible();
    // Verification cannot be changed while the composition has unsaved edits.
    await verification.getByRole("radio", { name: /Sin verificar/ }).check();
    await expect(verification.getByText("Guarda primero la composición")).toBeVisible();
    await saveComposition.click();
    await expect(composition.getByText("Composición guardada")).toBeVisible();

    // 2. Verification right after, with the token the composition save returned.
    // The fixture starts (and step 4 leaves it) at "Necesita reconfirmación".
    const confirmed = verification.getByRole("radio", { name: /Composición confirmada por cliente/ });
    const target = /\(actual\)/.test((await confirmed.locator("xpath=..").textContent()) ?? "")
      ? verification.getByRole("radio", { name: /Necesita reconfirmación/ })
      : confirmed;
    await target.check();
    const saveVerification = verification.getByRole("button", { name: "Guardar verificación" });
    const acknowledgement = verification.getByRole("checkbox", { name: /el cliente revisó y aprobó/ });
    if (await acknowledgement.count()) {
      await expect(saveVerification).toBeDisabled();
      await acknowledgement.check();
    }
    await saveVerification.click();
    await expect(verification.getByText("Verificación guardada")).toBeVisible();
    await expect(page.getByText(/modificado por otra sesión/)).toHaveCount(0);

    // 3. Archive needs a second step and states the consequence; restore after.
    await page.getByText("Opciones avanzadas").click();
    await page.getByRole("button", { name: "Archivar combo…" }).click();
    const confirm = page.getByRole("group", { name: "Confirmar archivo del combo" });
    await expect(confirm).toContainText("El producto asociado no se elimina ni se archiva.");
    await confirm.getByRole("button", { name: "Cancelar" }).click();
    await expect(confirm).toHaveCount(0);
    await page.getByRole("button", { name: "Archivar combo…" }).click();
    await page.getByRole("button", { name: "Sí, archivar combo" }).click();
    await expect(page.getByText("Combo archivado", { exact: true }).first()).toBeVisible();
    await expect(saveComposition).toHaveCount(0);
    await page.getByRole("button", { name: "Restaurar combo" }).click();
    await expect(page.getByText("Combo restaurado")).toBeVisible();

    // 4. Composition again, after three other writes to the same row. If the
    // composition was confirmed, the database resets it to reconfirmation and
    // the page says so instead of keeping a stale "confirmed" claim.
    const wasConfirmed = await verification.getByRole("radio", { name: /Composición confirmada por cliente/ }).isChecked();
    const current = await quantity.inputValue();
    await quantity.fill(current === "1" ? "2" : "1");
    if (wasConfirmed) await expect(composition.getByText("Esta composición está verificada")).toBeVisible();
    await composition.getByRole("button", { name: "Guardar composición" }).click();
    await expect(composition.getByText("Composición guardada")).toBeVisible();
    await expect(page.getByText(/modificado por otra sesión/)).toHaveCount(0);
    if (wasConfirmed) {
      await expect(composition.getByText("La verificación volvió a «Necesita reconfirmación».")).toBeVisible();
      await expect(verification.getByRole("radio", { name: /Necesita reconfirmación/ })).toBeChecked();
    }
  });

  test("Import Mayorista shows isolated rules and editable thresholds", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/admin/import/mayorista");
    await expect(page.getByRole("heading", { level: 1, name: "Mayorista" })).toBeVisible();
    for (const label of ["Árabe", "Diseñador", "Nicho"]) {
      const form = page.locator("form").filter({ has: page.getByRole("heading", { name: label }) });
      await expect(form.getByLabel("Mínimo de frascos")).toBeEnabled();
      await expect(form.getByLabel("Descuento por frasco (S/)")).toBeEnabled();
      await expect(form.getByRole("button", { name: "Guardar regla" })).toBeVisible();
    }
    const designer = page.locator("form").filter({ has: page.getByRole("heading", { name: "Diseñador" }) });
    const min = designer.getByLabel("Mínimo de frascos");
    const original = await min.inputValue();
    await min.fill(String(Number(original) + 1));
    await designer.getByRole("button", { name: "Guardar regla" }).click();
    await expect(min).toHaveValue(String(Number(original) + 1));
    await expectAccessibleAndContained(page, testInfo);
  });

  test("Parfums Admin no longer exposes a Mayorista workspace", async ({ page }) => {
    await page.goto("/admin/parfums/mayorista");
    await expect(page).toHaveURL(/\/admin\/import\/mayorista$/);
    await expect(page.getByRole("heading", { level: 1, name: "Mayorista" })).toBeVisible();
  });
});

test.describe("B2B combos and Mayorista (Parfums viewer)", () => {
  test.skip(LOCAL_ONLY || !hasIdentity("E2E_PARFUMS_VIEWER"), "requires disposable local fixtures and the E2E_PARFUMS_VIEWER_* identity");
  test.use({ storageState: PARFUMS_VIEWER_STATE });

  test("Parfums viewer is denied access to Import Mayorista", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/admin/parfums/combos");
    await expect(page.getByRole("heading", { level: 1, name: "Combos" })).toBeVisible();
    await expect(page.getByText(/Acceso de solo lectura/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Crear combo/ })).toHaveCount(0);

    await page.goto(`/admin/parfums/combos/${ids.editableCombo}`);
    await expect(page.getByRole("region", { name: "Qué ven tus clientes" })).toBeVisible();
    await expect(page.getByRole("list", { name: /Contenido de/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Guardar composición" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Guardar verificación" })).toHaveCount(0);
    await expect(page.getByRole("spinbutton")).toHaveCount(0);
    await expect(page.getByRole("radio")).toHaveCount(0);
    await page.getByText("Opciones avanzadas").click();
    await expect(page.getByRole("button", { name: /Archivar combo|Restaurar combo/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Ver producto/ }).first()).toBeVisible();
    await expectAccessibleAndContained(page, testInfo);

    await page.goto("/admin/parfums/combos/nuevo");
    await expect(page).toHaveURL(/\/admin\/parfums\/combos$/);

    await page.goto("/admin/import/mayorista");
    await expect(page).toHaveURL(/\/admin(?:\/login)?$/);
    await expectAccessibleAndContained(page, testInfo);
  });
});
