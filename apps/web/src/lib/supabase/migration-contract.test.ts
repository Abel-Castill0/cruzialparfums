import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = join(process.cwd(), "..", "..");
const MIGRATIONS = join(REPOSITORY_ROOT, "supabase", "migrations");

async function readMigrations(): Promise<string> {
  const names = (await readdir(MIGRATIONS))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const contents = await Promise.all(
    names.map((name) => readFile(join(MIGRATIONS, name), "utf8")),
  );
  return contents.join("\n");
}

function captures(sql: string, pattern: RegExp): string[] {
  return [...sql.matchAll(pattern)].map((match) => match[1]!);
}

describe("Supabase migration security contract", () => {
  it("enables RLS on every public table created by the migrations", async () => {
    const sql = await readMigrations();
    const tables = captures(sql, /create table public\.(\w+)/g).sort();
    const rlsTables = captures(
      sql,
      /alter table public\.(\w+)\s+enable row level security/g,
    ).sort();

    expect(rlsTables).toEqual(tables);
  });

  it("pins search_path on every SECURITY DEFINER function", async () => {
    const sql = await readMigrations();
    const definitions = [
      ...sql.matchAll(
        /create or replace function\s+([\w.]+\([^)]*\))[\s\S]*?\n\$\$;/gi,
      ),
    ];
    const functions = definitions.filter((definition) =>
      /security definer/i.test(definition[0]),
    );

    expect(functions.length).toBeGreaterThan(0);
    for (const definition of functions) {
      expect(definition[0], definition[1]).toContain("set search_path = ''");
    }
  });

  it("keeps sensitive tables revoked from anon and never grants anon writes", async () => {
    const sql = await readMigrations();
    const sensitiveTables = [
      "admin_memberships",
      "audit_log",
      "customers",
      "inventory",
      "order_lines",
      "orders",
    ];

    for (const table of sensitiveTables) {
      expect(sql).toMatch(
        new RegExp(`revoke all on public\\.${table}\\s+from anon`, "i"),
      );
    }

    expect(sql).not.toMatch(/for\s+(insert|update|delete|all)\s+to\s+[^;]*\banon\b/i);
  });

  it("includes the cross-unit, snapshot and audit-actor hardening gates", async () => {
    const sql = await readMigrations();

    expect(sql).toContain("campaign_products_enforce_unit");
    expect(sql).toContain("order_lines_enforce_unit");
    expect(sql).toContain("orders_freeze_snapshot");
    expect(sql).toContain("orders_validate_deposit_snapshot");
    expect(sql).toContain("reject_order_history_delete");
    expect(sql).toContain("actor_user_id = (select auth.uid())");
  });
});
