import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard: a Server Action is a public POST endpoint. Hiding a button
 * or redirecting a page is not authorization, so every admin mutation file must
 * re-resolve the caller on the server (requireUnitAdmin) — the database then
 * enforces the same rule again through the caller's own JWT.
 *
 * Files in AUTH_FLOW authenticate or recover an account, so they run before a
 * unit membership exists; they have their own tests and must stay listed here
 * deliberately rather than by accident.
 */
const SRC = join(__dirname, "..", "..");
const AUTH_FLOW = new Set([
  "app/admin/forgot-password/actions.ts",
  "app/admin/reset-password/actions.ts",
  "app/admin/login/actions.ts",
  "app/admin/mfa/challenge/actions.ts",
  "app/admin/mfa/enroll/actions.ts",
  "app/admin/security/actions.ts",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

function serverActionFiles(): string[] {
  return [join(SRC, "app", "admin"), join(SRC, "components", "admin")]
    .flatMap((dir) => walk(dir))
    .filter((file) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use server["']/.test(readFileSync(file, "utf8")))
    .map((file) => relative(SRC, file).split(sep).join("/"));
}

describe("admin Server Actions authorization", () => {
  const files = serverActionFiles();

  it("finds the admin action files (guards against the scan silently matching nothing)", () => {
    expect(files.length).toBeGreaterThanOrEqual(15);
    expect(files).toContain("app/admin/parfums/productos/actions.ts");
    expect(files).toContain("app/admin/import/consolidados/actions.ts");
  });

  it("lists only existing auth-flow files in the allow-list", () => {
    for (const allowed of AUTH_FLOW) expect(files, allowed).toContain(allowed);
  });

  it.each(files.filter((file) => !AUTH_FLOW.has(file)))("%s re-checks unit admin on the server", (file) => {
    const source = readFileSync(join(SRC, file), "utf8");
    expect(source).toMatch(/import\s*\{[^}]*\brequireUnitAdmin\b[^}]*\}\s*from\s*["']@\/lib\/auth\/admin-session["']/);
    expect(source).toMatch(/requireUnitAdmin\(\s*["'](parfums|import)["']\s*\)|requireUnitAdmin\(\s*unit\b/);
  });
});
