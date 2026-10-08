import { expect, test, type Page, type Route } from "@playwright/test";
import { GATE_B_ADMIN_STATE, PARFUMS_VIEWER_STATE, hasIdentity } from "./auth-state";
import { LOCAL_DB_AVAILABLE, localSql } from "./local-db";

// The owner manages a product's photos from Admin: order, primary, alt text,
// archive/restore, and several uploads at once. Disposable local stack only.
// The upload test fakes Cloudinary's HTTP response (the browser talks to
// api.cloudinary.com directly), so it proves the server authorization, the
// per-file queue and the registration in Supabase, but NOT a real Cloudinary
// upload; that needs a manual check on Preview.

const PRODUCT = "99002000-0000-4000-8000-0000000000a1";
const VARIANT = "99002000-0000-4000-8000-0000000000a2";
const CATEGORY = "99002000-0000-4000-8000-000000000004";
const UNIT_PARFUMS = "11111111-1111-4111-8111-111111111111";
const SLUG = "local-qa-photos";
// The viewer test runs in its own describe, so Playwright may run it on another worker at the same
// time as the management test. It therefore gets its own product: they must never share rows.
const MAIN = { product: PRODUCT, variant: VARIANT, slug: SLUG };
const VIEWER = { product: "99002000-0000-4000-8000-0000000000b1", variant: "99002000-0000-4000-8000-0000000000b2", slug: "local-qa-photos-viewer" };
// A server action takes 3-6 s on a loaded CI runner; the default 5 s wait is shorter than a correct run.
const SERVER_ACTION_TIMEOUT = 15_000;

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

function provisionProduct(withPhotos: boolean, qa = MAIN) {
  localSql(`
    insert into public.products(id,business_unit_id,slug,name,brand,gender,sales_mode,publication_status)
    values ('${qa.product}','${UNIT_PARFUMS}','${qa.slug}','LOCAL QA — Fotos','LOCAL QA','unisex','always_available','published')
    on conflict (id) do update set publication_status = 'published', archived_at = null;
    insert into public.product_categories(product_id,category_id) values ('${qa.product}','${CATEGORY}') on conflict do nothing;
    insert into public.product_variants(id,product_id,variant_kind,size_ml,label,price_amount,currency,publication_status,price_verification_status)
    values ('${qa.variant}','${qa.product}','decant',5,'LOCAL QA fotos 5 ml',10,'PEN','published','client_confirmed') on conflict do nothing;
    insert into public.inventory(product_variant_id,inventory_mode,availability_status)
    values ('${qa.variant}','status_only','available') on conflict do nothing;
    delete from public.product_media where product_id = '${qa.product}';
    ${withPhotos ? `insert into public.product_media(product_id,provider,secure_url,alt,is_primary,sort_order) values
      ('${qa.product}','legacy_static','/icon.png','QA foto A',true,0),
      ('${qa.product}','legacy_static','/images/parfums-home/parfums-decant-3ml.webp','QA foto B',false,1),
      ('${qa.product}','legacy_static','/images/parfums-home/parfums-decant-5ml.webp','QA foto C',false,2);` : ""}
  `);
}

/** React attaches its props to a DOM node when it hydrates it, so this is true
 * only once the page can react to input. Without it a fast runner types and
 * blurs before hydration and the event is lost (seen on CI, never locally). */
async function waitForHydration(page: Page, selector: string) {
  await page.waitForFunction((css) => {
    const el = document.querySelector(css);
    return !!el && Object.keys(el).some((key) => key.startsWith("__reactProps$"));
  }, selector, { timeout: SERVER_ACTION_TIMEOUT });
}

async function openAdmin(page: Page) {
  await page.goto(`/admin/parfums/productos/${PRODUCT}`);
  await waitForHydration(page, '[data-archived="false"] input, [data-media-dropzone], [data-media-unconfigured]');
}

/** Photo alt texts in the order the public gallery shows them. */
async function publicOrder(page: Page): Promise<string[]> {
  await page.goto(`/parfums/productos/${SLUG}`);
  const thumbs = page.locator("[data-gallery-thumbs] button");
  const total = await thumbs.count();
  if (total === 0) {
    const single = await page.locator("[data-product-stage] img").count();
    return single ? [(await page.locator("[data-product-stage] img").first().getAttribute("alt")) ?? ""] : [];
  }
  await waitForHydration(page, "[data-gallery-thumbs] button");
  const alts: string[] = [];
  for (let i = 0; i < total; i += 1) {
    await thumbs.nth(i).click();
    await expect(page.locator("[data-product-stage] span[aria-live]")).toHaveText(`${i + 1} / ${total}`);
    alts.push((await page.locator("[data-product-stage] img").first().getAttribute("alt")) ?? "");
  }
  return alts;
}

function card(page: Page, alt: string) {
  return page.locator('[data-archived="false"]').filter({ has: page.locator(`input[value="${alt}"]`) });
}

test.describe("Photo management from Admin", () => {
  test.skip(!LOCAL_DB_AVAILABLE || !hasIdentity("E2E_GATE_B_ADMIN"), "requires the disposable local stack and the E2E_GATE_B_ADMIN_* identity");
  test.use({ storageState: GATE_B_ADMIN_STATE });
  test.describe.configure({ mode: "serial" });

  test("the owner orders, sets primary, edits alt text and archives photos; the storefront follows", async ({ page }) => {
    // Many steps, each a server action plus a storefront page load: longer than the 30 s default on a slow runner.
    test.setTimeout(90_000);
    provisionProduct(true);
    await openAdmin(page);
    await expect(page.getByRole("heading", { name: "Fotos (3)" })).toBeVisible({ timeout: SERVER_ACTION_TIMEOUT });

    // Alt text, saved on leaving the field. It is also the first Admin action
    // on this product, which refreshes the storefront's 60 s catalog cache so
    // the freshly provisioned product is visible publicly.
    const alt = card(page, "QA foto A").getByLabel("Texto alternativo");
    await alt.fill("QA foto A editada");
    await alt.blur();
    await expect(page.locator("[data-media-notice]")).toContainText("Texto alternativo guardado", { timeout: SERVER_ACTION_TIMEOUT });
    expect(localSql(`select alt from public.product_media where product_id='${PRODUCT}' and sort_order=0`)).toBe("QA foto A editada");
    expect(await publicOrder(page)).toEqual(["QA foto A editada", "QA foto B", "QA foto C"]);

    await openAdmin(page);
    // The primary photo cannot be moved: the storefront always shows it first.
    await expect(card(page, "QA foto A editada").getByRole("button", { name: /Mover foto/ })).toHaveCount(0);
    await expect(card(page, "QA foto B").getByRole("button", { name: "Mover foto antes" })).toBeDisabled();

    // Reorder: C moves above B.
    await card(page, "QA foto C").getByRole("button", { name: "Mover foto antes" }).click();
    await expect(page.locator("[data-media-notice]")).toContainText("Orden guardado", { timeout: SERVER_ACTION_TIMEOUT });
    expect(await publicOrder(page)).toEqual(["QA foto A editada", "QA foto C", "QA foto B"]);

    // Primary: B becomes the primary and is shown first.
    await openAdmin(page);
    await card(page, "QA foto B").getByRole("button", { name: "Marcar como principal" }).click();
    await expect(page.locator("[data-media-notice]")).toContainText("Foto principal actualizada", { timeout: SERVER_ACTION_TIMEOUT });
    expect((await publicOrder(page))[0]).toBe("QA foto B");
    expect(localSql(`select count(*) from public.product_media where product_id='${PRODUCT}' and is_primary and archived_at is null`)).toBe("1");

    // Archive hides it from the storefront; restore brings it back.
    await openAdmin(page);
    await card(page, "QA foto C").getByRole("button", { name: "Archivar" }).click();
    await expect(page.locator("[data-media-notice]")).toContainText("Foto archivada", { timeout: SERVER_ACTION_TIMEOUT });
    await expect(page.getByRole("heading", { name: "Fotos (2)" })).toBeVisible({ timeout: SERVER_ACTION_TIMEOUT });
    expect((await publicOrder(page)).length).toBe(2);

    await openAdmin(page);
    await page.getByText(/1 imagen archivada/).click();
    await page.getByRole("button", { name: "Restaurar" }).click();
    await expect(page.getByRole("heading", { name: "Fotos (3)" })).toBeVisible({ timeout: SERVER_ACTION_TIMEOUT });
    expect((await publicOrder(page)).length).toBe(3);
  });

  test.describe("uploading several photos at once (Cloudinary faked)", () => {
    test.skip(!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_SECRET, "needs fake CLOUDINARY_* env on the local server");

    async function fakeCloudinary(page: Page) {
      await page.route("https://api.cloudinary.com/**", async (route: Route) => {
        const request = route.request();
        const cloud = /\/v1_1\/([^/]+)\/image\/upload/.exec(request.url())?.[1] ?? "";
        const publicId = /name="public_id"\r\n\r\n([^\r\n]+)/.exec(request.postData() ?? "")?.[1] ?? "";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify({
            public_id: publicId,
            secure_url: `https://res.cloudinary.com/${cloud}/image/upload/v1/${publicId}.png`,
            width: 1, height: 1, bytes: ONE_PIXEL_PNG.length, format: "png",
          }),
        });
      });
      await page.route("https://res.cloudinary.com/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: ONE_PIXEL_PNG }));
    }

    test("a product with no photos: the first upload becomes primary, a bad file fails alone", async ({ page }) => {
      provisionProduct(false);
      await fakeCloudinary(page);
      await openAdmin(page);
      await expect(page.locator("[data-media-dropzone]")).toBeVisible();

      await page.locator('input[type="file"]').setInputFiles([
        { name: "uno.png", mimeType: "image/png", buffer: ONE_PIXEL_PNG },
        { name: "nota.txt", mimeType: "text/plain", buffer: Buffer.from("no es una imagen") },
        { name: "dos.png", mimeType: "image/png", buffer: ONE_PIXEL_PNG },
      ]);

      const queue = page.locator("[data-media-queue] li");
      await expect(queue.filter({ hasText: "uno.png" })).toContainText("Subida", { timeout: 20_000 });
      await expect(queue.filter({ hasText: "dos.png" })).toContainText("Subida", { timeout: 20_000 });
      await expect(queue.filter({ hasText: "nota.txt" })).toContainText("Solo se aceptan imágenes");
      await expect(page.getByRole("heading", { name: "Fotos (2)" })).toBeVisible({ timeout: SERVER_ACTION_TIMEOUT });

      expect(localSql(`select count(*) from public.product_media where product_id='${PRODUCT}' and provider='cloudinary'`)).toBe("2");
      expect(localSql(`select count(*) from public.product_media where product_id='${PRODUCT}' and is_primary`)).toBe("1");
      expect(localSql(`select string_agg(sort_order::text, ',' order by sort_order) from public.product_media where product_id='${PRODUCT}'`)).toBe("0,1");
    });

    test("a product that already has a primary keeps it when more photos arrive", async ({ page }) => {
      provisionProduct(true);
      await fakeCloudinary(page);
      await openAdmin(page);
      await page.locator('input[type="file"]').setInputFiles([
        { name: "extra.png", mimeType: "image/png", buffer: ONE_PIXEL_PNG },
      ]);
      await expect(page.getByRole("heading", { name: "Fotos (4)" })).toBeVisible({ timeout: 20_000 });
      expect(localSql(`select alt from public.product_media where product_id='${PRODUCT}' and is_primary`)).toBe("QA foto A");
      expect(localSql(`select max(sort_order) from public.product_media where product_id='${PRODUCT}'`)).toBe("3");
    });
  });
});

test.describe("Photo management is read-only for a viewer", () => {
  test.skip(!LOCAL_DB_AVAILABLE || !hasIdentity("E2E_PARFUMS_VIEWER"), "requires the disposable local stack and the E2E_PARFUMS_VIEWER_* identity");
  test.use({ storageState: PARFUMS_VIEWER_STATE });

  test("a viewer sees the photos and an explicit reason, with no way to change them", async ({ page }) => {
    provisionProduct(true, VIEWER);
    await page.goto(`/admin/parfums/productos/${VIEWER.product}`);
    await expect(page.getByRole("heading", { name: "Fotos (3)" })).toBeVisible({ timeout: SERVER_ACTION_TIMEOUT });
    await expect(page.locator("[data-media-readonly]")).toContainText("rol de administrador");
    await expect(page.locator("[data-media-dropzone]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Archivar|Marcar como principal|Mover foto/ })).toHaveCount(0);
    await expect(page.getByLabel("Texto alternativo").first()).toBeDisabled();
  });
});
