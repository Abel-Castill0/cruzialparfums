/** Paths of the storageState files auth.setup.ts produces. */
export const ADMIN_STATE = "e2e/.auth/admin.json";
export const PARFUMS_ADMIN_STATE = "e2e/.auth/parfums-admin.json";
export const GATE_B_ADMIN_STATE = "e2e/.auth/gate-b-admin.json";

/**
 * True when the runner provided the full QA identity (email, password, TOTP
 * secret) that auth.setup.ts signs in with. Authenticated specs gate on this
 * — known before Playwright collects tests — rather than on the storageState
 * file, which only exists after the dependent setup project has run and is
 * therefore always missing at collection time. If setup itself fails, the
 * dependent "admin" project does not run, so no spec proceeds unauthenticated.
 */
export function hasIdentity(prefix: "E2E_ADMIN" | "E2E_PARFUMS_ADMIN" | "E2E_GATE_B_ADMIN"): boolean {
  return Boolean(
    process.env[`${prefix}_EMAIL`] && process.env[`${prefix}_PASSWORD`] && process.env[`${prefix}_TOTP_SECRET`],
  );
}
