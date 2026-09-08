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

  it("keeps admin mutation RPCs in public (callable) and their audit/authz helpers in app (not callable)", async () => {
    const sql = await readMigrations();

    // supabase-js .rpc() can only reach a function in a schema config.toml's
    // api.schemas exposes — "public" here. A mutation defined under `app.`
    // would silently be uncallable from the client, not merely insecure.
    const adminMutations = [
      "admin_create_product",
      "admin_update_product",
      "admin_archive_product",
      "admin_restore_product",
      "admin_create_variant",
      "admin_update_variant",
      "admin_archive_variant",
      "admin_restore_variant",
      "admin_update_inventory",
      "admin_set_product_categories",
    ];
    for (const name of adminMutations) {
      expect(sql).toMatch(new RegExp(`create or replace function public\\.${name}\\(`));
      expect(sql).not.toMatch(new RegExp(`create or replace function app\\.${name}\\(`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${name}\\([^;]*?\\) to authenticated`));
    }

    // The reverse guarantee: a client must not be able to call the audit
    // writer directly and forge an entry disconnected from a real mutation,
    // nor call the raw authorization check as if it were a query.
    expect(sql).toMatch(/create or replace function app\.write_audit_log\(/);
    expect(sql).not.toMatch(/create or replace function public\.write_audit_log\(/);
    expect(sql).toMatch(/create or replace function app\.assert_admin_for\(/);
    expect(sql).not.toMatch(/create or replace function public\.assert_admin_for\(/);
  });

  it("never grants an admin mutation RPC to anon", async () => {
    const sql = await readMigrations();
    const grants = [...sql.matchAll(/grant execute on function public\.admin_\w+\([^;]*;/g)];

    expect(grants.length).toBeGreaterThan(0);
    for (const [grant] of grants) {
      expect(grant).not.toMatch(/\banon\b/);
    }
  });
});
