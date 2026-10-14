import { expect, test, type Page } from "@playwright/test";
import { GATE_B_ADMIN_STATE, hasIdentity } from "./auth-state";
import { LOCAL_DB_AVAILABLE, localSql, testCustomerPhone } from "./local-db";

// Commercial rules in the admin (docs/commercial-rules.md). Mutates delivery zones, agencies and one synthetic order, so it
// runs in the isolated project and restores everything. It signs in with the Gate B admin: the shared dual-admin session is
// revoked globally by the logout journey that runs before this project.

const ZONE = "Barranco";

test.describe("Commercial rules admin", () => {
  test.skip(!LOCAL_DB_AVAILABLE || !hasIdentity("E2E_GATE_B_ADMIN"), "requires the disposable local stack and the E2E_GATE_B_ADMIN_* identity");
  test.use({ storageState: GATE_B_ADMIN_STATE, viewport: { width: 1280, height: 900 } });

  async function motorizadoCallout(visitor: Page, district: string) {
    await visitor.goto("/parfums/checkout");
    await visitor.getByRole("radio", { name: /Motorizado/ }).check({ force: true });
    await visitor.locator(`[data-district="${district}"]`).click();
    return visitor.locator("[data-motorizado-panel] [role=status]");
  }

  test("a zone saved in the admin reaches the checkout within 5 s, and Shalom stays available", async ({ page, browser }) => {
    const seeded = localSql(`select is_restricted from public.delivery_zones where district = '${ZONE}';`);
    test.skip(seeded === "", "the proposed zone list is not loaded on this stack");
    const visitor = await (await browser.newContext({ storageState: { cookies: [], origins: [] } })).newPage();
    try {
      await page.goto("/admin/parfums/reglas");
      await expect(page.getByRole("heading", { name: "Zonas del motorizado" })).toBeVisible();
      const row = page.locator(`li[data-zone="${ZONE}"]`);
      await expect(row).toBeVisible();

      await expect((await motorizadoCallout(visitor, ZONE))).not.toContainText("El motorizado no llega");

      await row.getByLabel("Sin motorizado").check();
      await row.getByRole("button", { name: "Guardar" }).click();
      await expect(row.getByRole("status")).toHaveText("Distrito guardado.");
      const savedAt = Date.now();

      await expect(async () => {
        const callout = await motorizadoCallout(visitor, ZONE);
        await expect(callout).toContainText(`El motorizado no llega a ${ZONE}`, { timeout: 1_000 });
      }).toPass({ timeout: 5_000, intervals: [250] });
      expect(Date.now() - savedAt, "the checkout sees the change within 5 s").toBeLessThan(5_500);

      // Never a dead end: the same screen offers Shalom.
      await visitor.getByRole("button", { name: "Prefiero recoger en Shalom" }).click();
      await expect(visitor.locator("[data-shalom-panel]")).toBeVisible();
    } finally {
      // Restore through the admin so the cache tag is expired too (a plain SQL update would leave the checkout on the
      // old list until the fallback TTL); SQL is the last resort if the UI path is what failed.
      try {
        await page.goto("/admin/parfums/reglas");
        const row = page.locator(`li[data-zone="${ZONE}"]`);
        const box = row.getByLabel("Sin motorizado");
        if ((await box.isChecked()) !== (seeded === "t")) {
          await box.setChecked(seeded === "t");
          await row.getByRole("button", { name: "Guardar" }).click();
          await expect(row.getByRole("status")).toHaveText("Distrito guardado.");
        }
      } catch {
        // fall through to the SQL restore below
      }
      localSql(`update public.delivery_zones set is_restricted = ${seeded === "t" ? "true" : "false"} where district = '${ZONE}';`);
      await visitor.context().close();
    }
  });

  test("an admin adds and removes a shipping agency, with the confirmation the removal needs", async ({ page }) => {
    const name = `QA Agencia ${Date.now() % 100000}`;
    try {
      await page.goto("/admin/parfums/reglas");
      await expect(page.locator('li[data-agency="Shalom"]')).toBeVisible();

      const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Agregar agencia" }) });
      await form.getByLabel("Nueva agencia").fill(name);
      await form.getByLabel("Cobertura").fill("Lima y provincias");
      await form.getByRole("button", { name: "Agregar agencia" }).click();
      const row = page.locator(`li[data-agency="${name}"]`);
      await expect(row).toBeVisible();

      await row.getByRole("button", { name: "Eliminar" }).click();
      await row.getByRole("button", { name: "Eliminar" }).click();
      // The checkbox is required: removal without the confirmation does nothing.
      await expect(row).toBeVisible();
      await row.getByLabel(/Confirmo eliminar/).check();
      await row.getByRole("button", { name: "Eliminar" }).click();
      await expect(row).toHaveCount(0);
    } finally {
      localSql(`delete from public.shipping_agencies where name = '${name}';`);
    }
  });

  test("the shipping cost quoted on an order is stored in cents and never changes its total", async ({ page }, testInfo) => {
    const phone = testCustomerPhone(testInfo);
    const orderId = localSql(`
      insert into public.orders (business_unit_id, order_number, channel, status, customer_snapshot, delivery_snapshot, subtotal_amount)
      values ('11111111-1111-4111-8111-111111111111', 'CRP-QA-RULES-${phone}', 'whatsapp', 'pending_whatsapp_confirmation',
              '{"name":"QA Reglas","phone":"${phone}"}', '{"district":"Miraflores","delivery":"Agencia Shalom (Lima y todo el Perú)","note":""}', 100)
      returning id;`).split("\n")[0]!;
    await page.goto(`/admin/parfums/pedidos/${orderId}`);
    await expect(page.getByText("Sin cotizar").first()).toBeVisible();

    const input = page.getByLabel("Costo de envío cotizado (S/)");
    await input.fill("15,50");
    await page.getByRole("button", { name: "Guardar costo de envío" }).click();
    await expect(page.getByText("Costo de envío guardado.")).toBeVisible();
    expect(localSql(`select shipping_cost_cents || '|' || subtotal_amount from public.orders where id = '${orderId}';`)).toBe("1550|100.00");
    await expect(page.getByText("S/ 15.50").first()).toBeVisible();

    await input.fill("quince");
    await page.getByRole("button", { name: "Guardar costo de envío" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Escribe un monto en soles" })).toBeVisible();
    expect(localSql(`select shipping_cost_cents from public.orders where id = '${orderId}';`)).toBe("1550");

    await input.fill("");
    await page.getByRole("button", { name: "Guardar costo de envío" }).click();
    await expect(page.getByText("Costo de envío borrado.")).toBeVisible();
    expect(localSql(`select coalesce(shipping_cost_cents::text, 'null') from public.orders where id = '${orderId}';`)).toBe("null");
  });
});
