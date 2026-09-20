import { expect, test } from "@playwright/test";

// Test 4 — Logged-out Admin protection.
// Without any auth state, protected admin routes must redirect to
// /admin/login: no redirect loop, no protected content exposed.

for (const path of ["/admin/parfums", "/admin/import"]) {
  test(`logged-out ${path} redirects to /admin/login`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/admin\/login$/);

    // No redirect loop: the login page itself must not bounce again.
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/admin\/login$/);

    // No protected admin content is exposed on the way through.
    await expect(page.getByRole("heading", { name: /panel|dashboard/i })).toHaveCount(0);
  });
}
