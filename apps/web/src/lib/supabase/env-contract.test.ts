import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guards on the environment contract.
 *
 * These are cheap to run and catch the two mistakes that would be worst here:
 * publishing a secret through a NEXT_PUBLIC_* name (which inlines it into the
 * client bundle) and importing the RLS-bypassing admin client from code that
 * ships to the browser.
 */

const SRC = join(process.cwd(), "src");

async function collectSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return collectSourceFiles(full);
      if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) return [full];
      return [];
    }),
  );
  return files.flat();
}

describe("supabase environment contract", () => {
  it("never exposes a secret or service-role key through NEXT_PUBLIC_*", async () => {
    const files = await collectSourceFiles(SRC);
    const offenders: string[] = [];

    for (const file of files) {
      // This guard necessarily contains the literal pattern it rejects.
      if (file.endsWith("env-contract.test.ts")) continue;

      const contents = await readFile(file, "utf8");
      // A NEXT_PUBLIC_ name that also mentions a secret-ish word is the bug
      // we are guarding against, in either order.
      const matches = contents.match(/NEXT_PUBLIC_[A-Z0-9_]*(SECRET|SERVICE_ROLE|PRIVATE)[A-Z0-9_]*/g);
      if (matches) offenders.push(`${file}: ${matches.join(", ")}`);
    }

    expect(offenders).toEqual([]);
  });

  it("keeps the RLS-bypassing admin client out of client components", async () => {
    const files = await collectSourceFiles(SRC);
    const offenders: string[] = [];

    for (const file of files) {
      const contents = await readFile(file, "utf8");
      const isClientComponent = /^\s*["']use client["']/m.test(contents);
      if (!isClientComponent) continue;

      if (
        contents.includes("createSupabaseAdminClient") ||
        contents.includes("SUPABASE_SECRET_KEY") ||
        contents.includes("readSupabaseSecretKey")
      ) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("does not hardcode a Supabase key literal anywhere in source", async () => {
    const files = await collectSourceFiles(SRC);
    const offenders: string[] = [];

    for (const file of files) {
      // This test file necessarily contains the patterns it searches for.
      if (file.endsWith("env-contract.test.ts")) continue;

      const contents = await readFile(file, "utf8");
      // Current key format (sb_publishable_… / sb_secret_…) and the legacy
      // JWT-shaped anon/service_role keys.
      if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(contents)) offenders.push(`${file}: sb_secret literal`);
      if (/sb_publishable_[A-Za-z0-9_-]{10,}/.test(contents)) offenders.push(`${file}: sb_publishable literal`);
      if (/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(contents)) offenders.push(`${file}: JWT literal`);
    }

    expect(offenders).toEqual([]);
  });

  it("keeps the bootstrap email server-only and out of application source", async () => {
    const files = await collectSourceFiles(SRC);
    const offenders: string[] = [];

    for (const file of files) {
      // This guard necessarily contains the literal patterns it rejects.
      if (file.endsWith("env-contract.test.ts")) continue;

      const contents = await readFile(file, "utf8");
      if (contents.includes("NEXT_PUBLIC_ADMIN_BOOTSTRAP_EMAIL")) offenders.push(file);
      if (/cruzialof@gmail\.com/i.test(contents)) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });
});
