import { expect, test } from "@playwright/test";
import { GATE_B_ADMIN_STATE, hasIdentity } from "./auth-state";
import { LOCAL_DB_AVAILABLE, localSql } from "./local-db";

// Owner operability with incomplete data (2026-10-01). Proves the owner can,
// from Admin: edit a provisional launch price and explicitly confirm it, edit a
// product, and complete the legal identity (which clears the dashboard
// warning). Disposable local stack only; every test re-provisions or restores
// what it touches so it is rerun-safe.

const PRODUCT = "99002000-0000-4000-8000-000000000051";
const VARIANT = "99002000-0000-4000-8000-000000000052";
const UNIT_PARFUMS = "11111111-1111-4111-8111-111111111111";

function provisionOwnerProvisionalVariant() {
  localSql(`
    insert into public.products(id,business_unit_id,slug,name,brand,gender,sales_mode,publication_status)
    values ('${PRODUCT}','${UNIT_PARFUMS}','local-qa-owner-launch','LOCAL QA — Precio inicial','LOCAL QA','unisex','always_available','draft')
    on conflict (id) do update set name = excluded.name, publication_status = 'draft';
    insert into public.product_variants(id,product_id,variant_kind,size_ml,label,price_amount,currency,publication_status,price_verification_status)
    values ('${VARIANT}','${PRODUCT}','bottle',100,'LOCAL QA owner 100 ml',250,'PEN','draft','owner_selected_provisional')
    on conflict (id) do update set price_amount = 250, price_verification_status = 'owner_selected_provisional', publication_status = 'draft';
    insert into public.inventory(product_variant_id,inventory_mode,availability_status)
    values ('${VARIANT}','status_only','available') on conflict do nothing;
  `);
}

test.describe("Owner operability with incomplete data (admin)", () => {
  test.skip(!LOCAL_DB_AVAILABLE || !hasIdentity("E2E_GATE_B_ADMIN"), "requires the disposable local stack and the E2E_GATE_B_ADMIN_* identity");
  test.use({ storageState: GATE_B_ADMIN_STATE });
  test.describe.configure({ mode: "serial" });

  test("a provisional launch price is editable and only an explicit step confirms it", async ({ page }) => {
    provisionOwnerProvisionalVariant();
    await page.goto(`/admin/parfums/productos/${PRODUCT}`);
    const row = page.getByRole("row").filter({ hasText: "LOCAL QA owner 100 ml" });
    await expect(row).toContainText("Precio inicial provisional");
    await expect(row).toContainText("250.00");

    // 1. Editing the amount keeps it provisional (never silently confirmed).
    await row.getByRole("button", { name: "Editar" }).click();
    const price = page.locator('input[name="priceAmount"]');
    await expect(page.getByText(/lo\s+eligió el dueño a partir de la investigación de mercado/)).toBeVisible();
    await price.fill("275.50");
    await page.getByRole("button", { name: "Guardar variante" }).click();
    await expect(row).toContainText("275.50");
    await expect(row).toContainText("Precio inicial provisional");
    expect(localSql(`select price_verification_status||':'||price_amount from public.product_variants where id='${VARIANT}'`))
      .toBe("owner_selected_provisional:275.50");

    // 2. Only the explicit checkbox moves it to client_confirmed.
    await row.getByRole("button", { name: "Editar" }).click();
    await page.getByLabel("Precio confirmado por el cliente").check();
    await page.getByRole("button", { name: "Guardar variante" }).click();
    await expect(row).not.toContainText("Precio inicial provisional");
    expect(localSql(`select price_verification_status from public.product_variants where id='${VARIANT}'`)).toBe("client_confirmed");
  });

  test("the owner can edit a product from Admin", async ({ page }) => {
    provisionOwnerProvisionalVariant();
    await page.goto(`/admin/parfums/productos/${PRODUCT}`);
    const name = page.getByLabel(/^Nombre/).first();
    await name.fill("LOCAL QA — Precio inicial editado");
    await page.getByRole("button", { name: "Guardar información" }).click();
    await expect(page.getByText("Información guardada")).toBeVisible();
    expect(localSql(`select name from public.products where id='${PRODUCT}'`)).toBe("LOCAL QA — Precio inicial editado");
    provisionOwnerProvisionalVariant();
  });

  test("completing the legal identity in Configuración clears the dashboard warning (and is reversible)", async ({ page }) => {
    // The legal card is the second (last) editable card on Configuración.
    await page.goto("/admin/parfums");
    await expect(page.getByText("Faltan datos legales del negocio")).toBeVisible();

    await page.goto("/admin/parfums/configuracion");
    await page.getByRole("button", { name: "Editar" }).last().click();
    await page.getByLabel("Razón social").fill("LOCAL QA S.A.C.");
    await page.getByLabel(/^RUC/).fill("20123456789");
    await page.getByLabel("Dirección para reclamos").fill("Av. QA 123, Lima");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Configuración guardada")).toBeVisible();
    await expect(page.getByText("20123456789")).toBeVisible();

    await page.goto("/admin/parfums");
    await expect(page.getByText("Faltan datos legales del negocio")).toHaveCount(0);

    // restore the blank state so the suite stays rerun-safe
    await page.goto("/admin/parfums/configuracion");
    await page.getByRole("button", { name: "Editar" }).last().click();
    await page.getByLabel("Razón social").fill("");
    await page.getByLabel(/^RUC/).fill("");
    await page.getByLabel("Dirección para reclamos").fill("");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Configuración guardada")).toBeVisible();
    await page.goto("/admin/parfums");
    await expect(page.getByText("Faltan datos legales del negocio")).toBeVisible();
  });

  test("search indexing is an explicit, persisted owner switch, independent from incomplete content", async ({ page }) => {
    const read = () => localSql("select value->>'enabled' from public.settings where business_unit_id is null and key = 'search_indexing';");
    const original = read();
    localSql("update public.settings set value = '{\"enabled\": false}' where business_unit_id is null and key = 'search_indexing';");
    try {
      await page.goto("/admin/parfums/operaciones");
      const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Preparación para lanzamiento" }) });
      await expect(section).toContainText("Permitir indexación en buscadores: desactivada");
      // The completeness report is a warning next to the switch, never a lock on it.
      await section.getByRole("button", { name: "Permitir indexación en buscadores" }).click();
      await section.getByRole("button", { name: "Sí, permitir" }).click();
      await expect(section.getByRole("status")).toContainText("Indexación permitida");
      await page.reload();
      await expect(section).toContainText("Permitir indexación en buscadores: activada");
      expect(read()).toBe("true");
      // Non-production deployments stay closed to crawlers whatever the switch says.
      const robots = await page.request.get("/robots.txt");
      expect(await robots.text()).toMatch(/Disallow: \//);
      await section.getByRole("button", { name: "Desactivar indexación en buscadores" }).click();
      await section.getByRole("button", { name: "Sí, desactivar" }).click();
      await expect(section.getByRole("status")).toContainText("Indexación desactivada");
      expect(read()).toBe("false");
    } finally {
      if (original === "true" || original === "false") {
        localSql(`update public.settings set value = jsonb_build_object('enabled', ${original}) where business_unit_id is null and key = 'search_indexing';`);
      }
    }
  });
});
