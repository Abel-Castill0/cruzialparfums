import { expect, test } from "@playwright/test";
import { ADMIN_STATE, hasIdentity } from "./auth-state";
import { LOCAL_DB_AVAILABLE, localSql } from "./local-db";

// Cache revalidation of Import campaign changes (`import-campaign` tag). Closes and reopens the live campaign through the
// admin UI, so it runs in the isolated project (after the public journeys) and always restores the campaign.

test.describe("Import campaign changes reach the gateway within 5 s", () => {
  test.skip(!LOCAL_DB_AVAILABLE || !hasIdentity("E2E_ADMIN"), "requires the disposable local stack and the E2E_ADMIN_* identity");
  test.use({ storageState: ADMIN_STATE, viewport: { width: 1280, height: 900 } });

  test("closing and reopening the open campaign in the admin shows on / within 5 s each time", async ({ page, browser }) => {
    const campaignId = localSql("select id from public.campaigns where status = 'open' and archived_at is null order by number desc limit 1;");
    test.skip(!campaignId, "no open campaign on this stack");

    const visitor = await (await browser.newContext({ storageState: { cookies: [], origins: [] } })).newPage();
    const door = visitor.locator('a[data-unit="import"]');
    const gateClosed = async () => {
      await visitor.reload();
      return door.getAttribute("data-closed");
    };

    async function changeStatus(label: string) {
      await page.goto(`/admin/import/consolidados/${campaignId}`);
      await page.getByText("Cambiar estado manualmente").click();
      await page.getByLabel("Nuevo estado").selectOption({ label });
      await page.getByRole("button", { name: "Revisar cambio" }).click();
      const acknowledge = page.getByRole("checkbox", { name: /Entiendo que mis clientes/ });
      if (await acknowledge.isVisible().catch(() => false)) await acknowledge.check();
      await page.getByRole("button", { name: /^Sí, |^Abrir de todos modos/ }).click();
      await expect(page.getByText("✓ Estado actualizado.")).toBeVisible();
      return Date.now();
    }

    try {
      await visitor.goto("/");
      expect(await door.getAttribute("data-closed"), "the gateway starts with the campaign open").toBeNull();

      const closedAt = await changeStatus("Cerrado");
      await expect.poll(gateClosed, { timeout: 5_000, intervals: [250] }).toBe("true");
      expect(Date.now() - closedAt, "closing shows within 5 s").toBeLessThan(5_000);

      const reopenedAt = await changeStatus("Abierto");
      await expect.poll(gateClosed, { timeout: 5_000, intervals: [250] }).toBeNull();
      expect(Date.now() - reopenedAt, "reopening shows within 5 s").toBeLessThan(5_000);
    } finally {
      // Last resort if the UI path failed half way: the campaign must be open for whatever runs next.
      localSql(`update public.campaigns set status = 'open' where id = '${campaignId}' and status <> 'open';`);
      await visitor.context().close();
    }
  });
});
