import { defineConfig, devices } from "@playwright/test";

// baseURL is env-driven: default to local dev, override with E2E_BASE_URL for
// hosted Preview/staging runs, e.g.
//   E2E_BASE_URL=https://<preview>.vercel.app npx playwright test
const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
const isLocalTarget = !process.env.E2E_BASE_URL;

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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Only auto-start a local dev server when targeting the local default —
  // hosted/staging runs (E2E_BASE_URL set) never spawn a local server.
  // The property is omitted entirely (not set to undefined) when not needed,
  // since exactOptionalPropertyTypes forbids an explicit undefined here.
  ...(isLocalTarget
    ? {
        webServer: {
          command: "npm run dev",
          url: baseURL,
          reuseExistingServer: true,
          timeout: 60_000,
        },
      }
    : {}),
});
