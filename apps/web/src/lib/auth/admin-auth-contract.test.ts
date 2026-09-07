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
