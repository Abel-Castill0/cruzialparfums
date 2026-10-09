import { defineConfig, devices } from "@playwright/test";

/**
 * Cruzial V2 end-to-end suite.
 *
 * Targets:
 *   - local (default): E2E_BASE_URL unset. Starts `npm run start` (a fresh
 *     `npm run build` is expected first) so the suite exercises the
 *     production bundle, headers and CSP — not the dev server.
 *   - hosted: E2E_BASE_URL=https://… (Vercel preview/staging/production).
 *
 * Projects:
 *   - setup: builds admin storageState from E2E_ADMIN_* / E2E_PARFUMS_ADMIN_*
 *     (skips when unset; authenticated specs then skip themselves).
 *   - chromium / mobile: public journeys on Desktop Chrome and Pixel 7.
 *   - admin: authenticated journeys, desktop only.
 *   - isolated: runs after all others; may change shared synthetic state (restores it).
 */

// One tag per run, inherited by every worker: the prefix of deterministic
// synthetic test identities (see e2e/local-db.ts testCustomerPhone).
process.env.E2E_RUN_TAG ??= String(Math.floor(Date.now() / 1000) % 1_000_000).padStart(6, "0");

const localPort = process.env.E2E_LOCAL_PORT || "3000";
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${localPort}`;
const isLocalTarget = !process.env.E2E_BASE_URL;
const PUBLIC_SPECS = /(public-hub|parfums-public-journey|parfums-storefront|parfums-shell|import-public-journey|import-catalog-view|attempt-lifecycle|admin-protection|accessibility|ux-regressions)\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  // Hosted QA (scripts/qa-hosted-browser.mjs): every request crosses to a remote database and each
  // side-effect assertion spawns a throwaway psql container, so long journeys need a wider budget.
  timeout: process.env.E2E_QA_PROJECT_REF ? 60_000 : 30_000,
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "chromium", testMatch: [PUBLIC_SPECS, /ux-regressions-desktop\.spec\.ts/], use: { ...devices["Desktop Chrome"] } },
    { name: "responsive", testMatch: /responsive\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testMatch: [PUBLIC_SPECS, /ux-regressions-phone\.spec\.ts/], use: { ...devices["Pixel 7"] } },
    // Tablet portrait (touch, 820x1180) between the phone and desktop layouts. Chromium engine on purpose:
    // the layout breakpoints are what is under test, not a second browser engine.
    { name: "tablet", testMatch: PUBLIC_SPECS, use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 }, hasTouch: true } },
    {
      name: "admin",
      testMatch: /(admin-critical|admin-authenticated|gate-b-operations|admin-catalog-customers|admin-combos-wholesale|admin-owner-editability|admin-product-photos)\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
    // Runs last (depends on every other project): specs here change shared synthetic state on purpose.
    {
      name: "isolated",
      testMatch: /isolated-.*\.spec\.ts/,
      dependencies: ["chromium", "responsive", "mobile", "tablet", "admin"],
      use: { ...devices["Pixel 7"] },
    },
  ],
  ...(isLocalTarget
    ? {
        webServer: {
          command: `${process.env.E2E_SERVER === "dev" ? "npm run dev" : "npm run start"} -- --port ${localPort}`,
          url: baseURL,
          reuseExistingServer: !process.env.E2E_LOCAL_PORT,
          timeout: 60_000,
        },
      }
    : {}),
});
