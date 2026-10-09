import { expect, test } from "@playwright/test";
import { LOCAL_DB_AVAILABLE, localSql } from "./local-db";

// Runs in the "isolated" Playwright project, which depends on every other project and therefore starts
// only after they have all finished: it deliberately un-publishes the synthetic Import public contact,
// which no concurrently running test may observe. Disposable local stack or hosted QA only (localSql
// refuses anything else); the original value is restored in `finally` even when the assertion fails.

const IMPORT_UNIT = "22222222-2222-4222-8222-222222222222";

test("Import fallback contact status wraps inside the mobile hero", async ({ page }) => {
  test.skip(!LOCAL_DB_AVAILABLE, "needs the disposable fixture database to unconfigure the contact");
  const original = localSql(
    `select is_public from public.settings where business_unit_id = '${IMPORT_UNIT}' and key = 'public_contact';`,
  );
  localSql(`update public.settings set is_public = false where business_unit_id = '${IMPORT_UNIT}' and key = 'public_contact';`);
  try {
    await page.goto("/import");
    const status = page.locator("[data-import-home-hero] [role='status']");
    await expect(status).toBeVisible();
    const layout = await status.evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
      whiteSpace: getComputedStyle(element).whiteSpace,
    }));
    expect(layout.whiteSpace).toBe("normal");
    expect(layout.scroll).toBeLessThanOrEqual(layout.client);
  } finally {
    if (original === "t" || original === "f") {
      localSql(
        `update public.settings set is_public = ${original === "t"} where business_unit_id = '${IMPORT_UNIT}' and key = 'public_contact';`,
      );
    }
  }
});
