import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import { expect, test as setup } from "@playwright/test";

/**
 * Builds the admin storageState files the authenticated specs reuse.
 *
 * Credentials are never in the repo: they come from the environment of the
 * machine running the suite (a local QA account against the local Supabase
 * stack, or an operator-provided staging QA identity). When they are absent
 * the authenticated specs skip themselves.
 *
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD / E2E_ADMIN_TOTP_SECRET
 *     dual-admin (Parfums + Import) -> e2e/.auth/admin.json
 *   E2E_PARFUMS_ADMIN_EMAIL / E2E_PARFUMS_ADMIN_PASSWORD / E2E_PARFUMS_ADMIN_TOTP_SECRET
 *     Parfums-only admin (cross-unit denial) -> e2e/.auth/parfums-admin.json
 */

import { ADMIN_STATE, PARFUMS_ADMIN_STATE } from "./auth-state";

function base32Decode(secret: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret.replace(/=+$/, "").toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totp(secret: string, at = Date.now()): string {
  const counter = Math.floor(at / 1000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = digest[19]! & 0xf;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

type Identity = { email: string; password: string; totpSecret: string };

function identityFromEnv(prefix: string): Identity | null {
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  const totpSecret = process.env[`${prefix}_TOTP_SECRET`];
  return email && password && totpSecret ? { email, password, totpSecret } : null;
}

async function signIn(page: import("@playwright/test").Page, identity: Identity, statePath: string) {
  await page.goto("/admin/login");
  await page.getByLabel(/correo|email/i).fill(identity.email);
  await page.getByLabel(/contraseña/i).fill(identity.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin\/mfa\/challenge/);
  await page.getByLabel(/código/i).fill(totp(identity.totpSecret));
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  mkdirSync("e2e/.auth", { recursive: true });
  await page.context().storageState({ path: statePath });
}

setup("dual admin session", async ({ page }) => {
  const identity = identityFromEnv("E2E_ADMIN");
  setup.skip(!identity, "E2E_ADMIN_* not set");
  await signIn(page, identity!, ADMIN_STATE);
});

setup("parfums-only admin session", async ({ page }) => {
  const identity = identityFromEnv("E2E_PARFUMS_ADMIN");
  setup.skip(!identity, "E2E_PARFUMS_ADMIN_* not set");
  await signIn(page, identity!, PARFUMS_ADMIN_STATE);
});
