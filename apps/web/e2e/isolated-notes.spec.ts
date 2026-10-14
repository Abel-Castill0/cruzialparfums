import { expect, test } from "@playwright/test";
import { GATE_B_ADMIN_STATE, hasIdentity } from "./auth-state";
import { LOCAL_DB_AVAILABLE, localSql } from "./local-db";

// Notes (docs/notes-model.md): create notes in the admin, assign them to a product in order with the up/down buttons and see
// them, in that order, on the public product page; a note in use cannot be deleted. Mutates the catalog of a synthetic
// product, so it runs in the isolated project and restores everything.

test.describe("Notes admin", () => {
  test.skip(!LOCAL_DB_AVAILABLE || !hasIdentity("E2E_GATE_B_ADMIN"), "requires the disposable local stack and the E2E_GATE_B_ADMIN_* identity");
  test.use({ storageState: GATE_B_ADMIN_STATE, viewport: { width: 1280, height: 1000 } });

  test("create, assign in order, see on the product page, and protect a note in use", async ({ page, browser }) => {
    const product = localSql(
      "select id || '|' || slug from public.products where slug = 'local-qa-parfums' and publication_status = 'published';",
    );
    test.skip(!product, "the synthetic Parfums product is not loaded on this stack");
    const [productId, slug] = product.split("|") as [string, string];
    const tag = String(Date.now() % 100000);
    const first = `Nota QA A ${tag}`;
    const second = `Nota QA B ${tag}`;
    const originalNotes = localSql(`select coalesce(specs -> 'notes', 'null'::jsonb)::text from public.products where id = '${productId}';`);
    const visitor = await (await browser.newContext({ storageState: { cookies: [], origins: [] } })).newPage();

    async function createNote(name: string) {
      await page.goto("/admin/parfums/notas");
      const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Crear nota" }) });
      await form.getByLabel("Nombre").fill(name);
      await form.getByRole("button", { name: "Crear nota" }).click();
      await expect(page.locator(`li[data-note="${name}"]`)).toBeVisible();
    }

    try {
      await createNote(first);
      await createNote(second);

      // Warm the storefront cache with the product WITHOUT the new notes, so the check below proves the expiry on save.
      await visitor.goto(`/parfums/productos/${slug}`);
      await expect(visitor.locator("[data-product-notes] span", { hasText: "Nota QA" })).toHaveCount(0);

      await page.goto(`/admin/parfums/productos/${productId}`);
      const editor = page.locator("#notes-title").locator("xpath=ancestor::section[1]");
      for (const name of [first, second]) {
        await editor.getByLabel("Añadir una nota").selectOption({ label: name });
        await editor.getByRole("button", { name: "Añadir", exact: true }).click();
      }
      await editor.getByRole("button", { name: `Subir ${second}` }).click();
      await editor.getByRole("button", { name: "Guardar notas" }).click();
      await expect(editor.getByText("Notas guardadas")).toBeVisible();

      // Public product page: both notes, in the order the admin chose, within 5 s.
      await expect(async () => {
        await visitor.goto(`/parfums/productos/${slug}`);
        await expect(visitor.locator("[data-product-notes] span")).toHaveText([second, first], { timeout: 1_000 });
      }).toPass({ timeout: 5_000, intervals: [250] });

      // A note in use is not deletable from the notes screen.
      await page.goto("/admin/parfums/notas");
      const row = page.locator(`li[data-note="${first}"]`);
      await expect(row.getByText("La usan 1 producto(s)")).toBeVisible();
      await expect(row.getByRole("button", { name: "Eliminar" })).toHaveCount(0);

      // Take both off the product: the legacy notes must not come back.
      await page.goto(`/admin/parfums/productos/${productId}`);
      for (const name of [second, first]) await editor.getByRole("button", { name: `Quitar ${name}` }).click();
      await editor.getByRole("button", { name: "Guardar notas" }).click();
      await expect(editor.getByText("Notas guardadas")).toBeVisible();
      expect(localSql(`select specs -> 'notes' from public.products where id = '${productId}';`)).toBe("[]");

      // Now they are unused and can be deleted, with the confirmation.
      await page.goto("/admin/parfums/notas");
      for (const name of [first, second]) {
        const unused = page.locator(`li[data-note="${name}"]`);
        await unused.getByRole("button", { name: "Eliminar" }).click();
        await unused.getByLabel(/Confirmo eliminar/).check();
        await unused.getByRole("button", { name: "Eliminar" }).click();
        await expect(unused).toHaveCount(0);
      }
    } finally {
      localSql(`delete from public.product_notes where product_id = '${productId}';`);
      localSql(`delete from public.notes where name in ('${first}', '${second}');`);
      localSql(`update public.products set specs = ${originalNotes === "null" ? "specs - 'notes'" : `jsonb_set(specs, '{notes}', '${originalNotes}'::jsonb)`} where id = '${productId}';`);
      await visitor.context().close();
    }
  });
});
