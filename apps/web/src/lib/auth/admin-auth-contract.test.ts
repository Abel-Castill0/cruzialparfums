import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { safeAdminRedirectPath } from "./admin-redirect";

const SRC = join(process.cwd(), "src");
const SUPABASE_CONFIG = join(process.cwd(), "..", "..", "supabase", "config.toml");

async function collectSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return collectSourceFiles(path);
      return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
    }),
  );
  return nested.flat();
}

describe("admin authentication contract", () => {
  it("disables public signup and has no application signup call", async () => {
    const config = await readFile(SUPABASE_CONFIG, "utf8");
    const source = await Promise.all(
      (await collectSourceFiles(SRC)).map((file) => readFile(file, "utf8")),
    );

    expect(config).toMatch(/\[auth\][\s\S]*?enable_signup\s*=\s*false/);
    expect(config).toMatch(/\[auth\.email\][\s\S]*?enable_signup\s*=\s*false/);
    expect(source.join("\n")).not.toMatch(/\.auth\.signUp\s*\(/);
  });

  it("keeps every admin page request-dynamic", async () => {
    const pages = [
      "app/admin/page.tsx",
      "app/admin/login/page.tsx",
      "app/admin/parfums/page.tsx",
      "app/admin/import/page.tsx",
    ];

    for (const page of pages) {
      const source = await readFile(join(SRC, page), "utf8");
      expect(source, page).toContain('export const dynamic = "force-dynamic"');
    }
  });

  it.each([
    [null, "/admin"],
    ["/admin", "/admin"],
    ["/admin/import?tab=orders#open", "/admin/import?tab=orders#open"],
    ["/administrator", "/admin"],
    ["//evil.example/admin", "/admin"],
    ["https://evil.example/admin", "/admin"],
    ["javascript:alert(1)", "/admin"],
  ])("normalizes callback destination %s", (input, expected) => {
    expect(safeAdminRedirectPath(input)).toBe(expected);
  });
});

describe("Gate 2C1 — admin MFA / AAL2 contract", () => {
  it("enables local TOTP enroll+verify and keeps phone MFA disabled", async () => {
    const config = await readFile(SUPABASE_CONFIG, "utf8");

    expect(config).toMatch(/\[auth\.mfa\.totp\][\s\S]*?enroll_enabled\s*=\s*true/);
    expect(config).toMatch(/\[auth\.mfa\.totp\][\s\S]*?verify_enabled\s*=\s*true/);
    expect(config).toMatch(/\[auth\.mfa\.phone\][\s\S]*?enroll_enabled\s*=\s*false/);
  });

  it("never logs a TOTP code, secret, QR URI, or auth token in the MFA/recovery surfaces", async () => {
    const mfaDirs = [
      join(SRC, "lib/auth"),
      join(SRC, "app/admin/mfa"),
      join(SRC, "app/admin/security"),
      join(SRC, "app/admin/forgot-password"),
      join(SRC, "app/admin/reset-password"),
    ];
    const files = (await Promise.all(mfaDirs.map((dir) => collectSourceFiles(dir)))).flat();

    const offenders: string[] = [];
    for (const file of files) {
      const contents = await readFile(file, "utf8");
      const loggingLines = contents
        .split("\n")
        .filter((line) => /console\.(log|error|warn|info|debug)/.test(line));
      for (const line of loggingLines) {
        if (/secret|qr_code|qrCode|totp.*code|access_token|refresh_token/i.test(line)) {
          offenders.push(`${file}: ${line.trim()}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("getAdminSession only ever returns ok at aal2 (calls getAuthenticatorAssuranceLevel before ok)", async () => {
    const source = await readFile(join(SRC, "lib/auth/admin-session.ts"), "utf8");
    expect(source).toContain("getAuthenticatorAssuranceLevel");
    expect(source).toMatch(/currentLevel === "aal2"/);
  });

  it("MFA verify actions re-validate a browser-supplied factorId before use", async () => {
    const enroll = await readFile(join(SRC, "app/admin/mfa/enroll/actions.ts"), "utf8");
    const challenge = await readFile(join(SRC, "app/admin/mfa/challenge/actions.ts"), "utf8");
    const security = await readFile(join(SRC, "app/admin/security/actions.ts"), "utf8");

    for (const source of [enroll, challenge, security]) {
      expect(source).toContain("findOwnFactor");
    }
  });

  it("has no self-service factor removal: no unenroll, nowhere in app code", async () => {
    const source = (
      await Promise.all((await collectSourceFiles(SRC)).map((file) => readFile(file, "utf8")))
    ).join("\n");

    // V1 contract: factor removal is operator-only via Supabase. Application
    // code must never call unenroll — not for verified factors (no delete UI,
    // no DeleteFactor/removeFactor Server Action) and not for unverified
    // cleanup (inert by design).
    expect(source).not.toMatch(/\.auth\.mfa\.unenroll\s*\(/);
    expect(source).not.toMatch(/export\s+(async\s+)?function\s+(removeFactor|deleteFactor|unenrollFactor)/);
  });

  it("the forgot-password action returns one constant message regardless of branch taken", async () => {
    const source = await readFile(join(SRC, "app/admin/forgot-password/actions.ts"), "utf8");
    const returns = [...source.matchAll(/return\s*\{\s*message:\s*([^}]+)\}/g)].map((m) => m[1].trim());
    expect(returns.length).toBeGreaterThan(0);
    expect(new Set(returns).size).toBe(1);
    expect(returns[0]).toBe("GENERIC_MESSAGE");
  });

  it("password recovery redirect is built from server config, never from a request header", async () => {
    const source = await readFile(join(SRC, "app/admin/forgot-password/actions.ts"), "utf8");
    expect(source).toContain("readSiteUrl");
    expect(source).not.toMatch(/headers\(\)|request\.headers|[Hh]ost['"]\]/);
  });

  it("reset-password revokes sessions globally after a successful password change", async () => {
    const source = await readFile(join(SRC, "app/admin/reset-password/actions.ts"), "utf8");
    expect(source).toMatch(/signOut\(\{\s*scope:\s*"global"\s*\}\)/);
  });

  it("gates the password change on proven recovery, not merely on being signed in", async () => {
    const action = await readFile(join(SRC, "app/admin/reset-password/actions.ts"), "utf8");
    const page = await readFile(join(SRC, "app/admin/reset-password/page.tsx"), "utf8");

    // Both surfaces must derive the proof; neither may settle for getUser().
    for (const source of [action, page]) {
      expect(source).toContain("getRecoverySession");
      expect(source).not.toMatch(/auth\.getUser\(\)/);
    }
  });

  it("derives recovery proof from a signature-verified amr claim, not from caller input", async () => {
    const source = await readFile(join(SRC, "lib/auth/recovery-session.ts"), "utf8");

    expect(source).toContain("getClaims");
    expect(source).toMatch(/=== "recovery"/);
    // None of these are proof of anything: they are all attacker-controlled.
    expect(source).not.toMatch(/searchParams|headers\(\)|formData|localStorage|atob\(|jwtDecode/);
  });

  it("starts password recovery on the cookie-bound client so the PKCE code reaches the server", async () => {
    const source = await readFile(join(SRC, "app/admin/forgot-password/actions.ts"), "utf8");

    // The stateless public client defaults to the implicit flow, which
    // returns tokens in the URL fragment and never reaches /auth/callback.
    expect(source).toContain("createSupabaseServerClient");
    expect(source).not.toContain("createSupabasePublicServerClient");
  });

  it("security surface exposes verified factors and backup enrollment, never removal", async () => {
    const page = await readFile(join(SRC, "app/admin/security/page.tsx"), "utf8");
    const actions = await readFile(join(SRC, "app/admin/security/actions.ts"), "utf8");

    expect(page).toContain("AddFactorPanel");
    expect(page).not.toMatch(/RemoveFactorForm|removeFactor/);
    expect(actions).not.toMatch(/removeFactor|withFactorRemovalLock/);
    expect(actions).toMatch(/export\s+async\s+function\s+beginAddFactor/);
    expect(actions).toMatch(/export\s+async\s+function\s+verifyAddFactor/);
  });

  it("keeps the admin_memberships table impossible to write from the browser", async () => {
    const source = (
      await Promise.all((await collectSourceFiles(SRC)).map((file) => readFile(file, "utf8")))
    ).join("\n");

    expect(source).not.toMatch(/\.from\(\s*["']admin_memberships["']\s*\)\s*\.(insert|update|upsert|delete)\s*\(/);
  });
});
