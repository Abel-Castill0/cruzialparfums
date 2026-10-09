import { deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { localSql } from "./local-db";

// Real Cloudinary upload through the Admin UI, against the hosted QA database only.
// Opt-in: the "real-cloudinary" project exists only when scripts/qa-hosted-browser.mjs --real-cloudinary
// sets E2E_REAL_CLOUDINARY=1 (the only Cloudinary account is Production's). Synthetic 16x16 grey PNG on a
// synthetic QA product; every uploaded asset is destroyed at the end and the deletion is verified.

const PRODUCT = "99005000-0000-4000-8000-0000000000a1";
const VARIANT = "99005000-0000-4000-8000-0000000000a2";
const CATEGORY = "99002000-0000-4000-8000-000000000004";
const UNIT_PARFUMS = "11111111-1111-4111-8111-111111111111";
const SERVER_ACTION_TIMEOUT = 20_000;

function syntheticPng(): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Buffer) => {
    let x = 0xffffffff;
    for (const byte of bytes) x = table[(x ^ byte) & 255]! ^ (x >>> 8);
    return (x ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(16, 0); header.writeUInt32BE(16, 4); header[8] = 8; header[9] = 0;
  const raw = Buffer.concat(Array.from({ length: 16 }, () => Buffer.from([0, ...Array(16).fill(160)])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function cloudinaryAuth() {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME!, key = process.env.CLOUDINARY_API_KEY!, secret = process.env.CLOUDINARY_API_SECRET!;
  return { cloud, key, secret, basic: Buffer.from(`${key}:${secret}`).toString("base64") };
}

/** Admin API delete (Basic auth over HTTPS): no request signature to compute. Returns the deleted status. */
async function destroy(publicId: string): Promise<string | undefined> {
  const { cloud, basic } = cloudinaryAuth();
  const query = new URLSearchParams({ "public_ids[]": publicId, invalidate: "true" });
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/resources/image/upload?${query}`, {
    method: "DELETE",
    headers: { Authorization: `Basic ${basic}` },
  });
  const body = (await response.json()) as { deleted?: Record<string, string> };
  return body.deleted?.[publicId];
}

async function lookup(publicId: string): Promise<number> {
  const { cloud, basic } = cloudinaryAuth();
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/resources/image/upload/${encodeURIComponent(publicId)}`, {
    headers: { Authorization: `Basic ${basic}` },
  });
  return response.status;
}

/** Every asset under this product's folder, registered or not (an upload that failed to register too). */
async function assetsUnderProduct(): Promise<string[]> {
  const { cloud, basic } = cloudinaryAuth();
  const prefix = encodeURIComponent(`cruzial/parfums/products/${PRODUCT}/`);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/resources/image/upload?prefix=${prefix}&max_results=50`, {
    headers: { Authorization: `Basic ${basic}` },
  });
  const body = (await response.json()) as { resources?: { public_id: string }[] };
  return (body.resources ?? []).map((resource) => resource.public_id);
}

async function waitForHydration(page: Page, selector: string) {
  await page.waitForFunction((css) => {
    const el = document.querySelector(css);
    return !!el && Object.keys(el).some((key) => key.startsWith("__reactProps$"));
  }, selector, { timeout: SERVER_ACTION_TIMEOUT });
}

test.describe.configure({ mode: "serial" });

test("Admin uploads a real photo to Cloudinary, it is registered, served, archived and then destroyed", async ({ page, request }) => {
  test.setTimeout(120_000);
  localSql(`
    insert into public.products(id,business_unit_id,slug,name,brand,gender,sales_mode,publication_status)
    values ('${PRODUCT}','${UNIT_PARFUMS}','qa-real-cloudinary','QA — Cloudinary real','QA','unisex','always_available','draft')
    on conflict (id) do update set archived_at = null;
    insert into public.product_categories(product_id,category_id) values ('${PRODUCT}','${CATEGORY}') on conflict do nothing;
    insert into public.product_variants(id,product_id,variant_kind,size_ml,label,price_amount,currency,publication_status,price_verification_status)
    values ('${VARIANT}','${PRODUCT}','decant',5,'QA 5 ml',10,'PEN','draft','client_confirmed') on conflict do nothing;
    delete from public.product_media where product_id = '${PRODUCT}';
  `);
  const uploaded: string[] = [];
  try {
    await page.goto(`/admin/parfums/productos/${PRODUCT}`);
    await waitForHydration(page, "[data-media-dropzone], [data-media-unconfigured]");
    await expect(page.locator("[data-media-unconfigured]")).toHaveCount(0);

    await page.locator('input[type="file"]').setInputFiles([
      { name: "qa-real.png", mimeType: "image/png", buffer: syntheticPng() },
      { name: "nota.txt", mimeType: "text/plain", buffer: Buffer.from("no es una imagen") },
    ]);
    const queue = page.locator("[data-media-queue] li");
    await expect(queue.filter({ hasText: "qa-real.png" })).toContainText("Subida", { timeout: 60_000 });
    await expect(queue.filter({ hasText: "nota.txt" })).toContainText("Solo se aceptan imágenes");
    await expect(page.getByRole("heading", { name: "Fotos (1)" })).toBeVisible({ timeout: SERVER_ACTION_TIMEOUT });

    // Registered in QA exactly once, as primary, under this product's isolated folder.
    const row = localSql(`select provider || '|' || is_primary || '|' || sort_order || '|' || secure_url from public.product_media where product_id='${PRODUCT}'`);
    const [provider, primary, order, url] = row.split("|");
    expect([provider, primary, order]).toEqual(["cloudinary", "true", "0"]);
    const { cloud } = cloudinaryAuth();
    const match = url!.match(new RegExp(`^https://res\\.cloudinary\\.com/${cloud}/image/upload/(?:v\\d+/)?(cruzial/parfums/products/${PRODUCT}/[0-9a-f-]{36})\\.png$`));
    expect(match, "secure_url must be this cloud and this product's folder").not.toBeNull();
    uploaded.push(match![1]!);

    // Served by Cloudinary as an image.
    const served = await request.get(url!);
    expect(served.status()).toBe(200);
    expect(served.headers()["content-type"]).toContain("image/");

    // Archive from the Admin: the row is archived (kept for audit), not deleted.
    await page.locator('[data-archived="false"]').first().getByRole("button", { name: "Archivar" }).click();
    await expect.poll(() => localSql(`select count(*) from public.product_media where product_id='${PRODUCT}' and archived_at is not null`), { timeout: SERVER_ACTION_TIMEOUT }).toBe("1");
  } finally {
    // Clean up: the asset lives in Production's Cloudinary account, so it must not survive the test.
    for (const publicId of new Set([...uploaded, ...(await assetsUnderProduct())])) {
      expect(await destroy(publicId)).toBe("deleted");
      expect(await lookup(publicId)).toBe(404);
    }
    localSql(`delete from public.product_media where product_id='${PRODUCT}';`);
  }
});
