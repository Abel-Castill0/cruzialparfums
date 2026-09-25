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
 */

const localPort = process.env.E2E_LOCAL_PORT || "3000";
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${localPort}`;
const isLocalTarget = !process.env.E2E_BASE_URL;
const PUBLIC_SPECS = /(public-hub|parfums-public-journey|parfums-storefront|import-public-journey|admin-protection|accessibility)\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
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
    { name: "chromium", testMatch: PUBLIC_SPECS, use: { ...devices["Desktop Chrome"] } },
    { name: "responsive", testMatch: /responsive\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testMatch: PUBLIC_SPECS, use: { ...devices["Pixel 7"] } },
    {
      name: "admin",
      testMatch: /(admin-critical|admin-authenticated)\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
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
