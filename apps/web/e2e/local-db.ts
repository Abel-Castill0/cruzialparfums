import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Direct SQL against the DISPOSABLE local Supabase stack only — used to make
 * mutating E2E tests self-provisioning and to assert persistence side
 * effects. Refuses to run unless the local fixture runner set
 * E2E_LOCAL_FIXTURES=1 and no hosted E2E_BASE_URL is targeted.
 */
export const LOCAL_DB_AVAILABLE = process.env.E2E_LOCAL_FIXTURES === "1" && !process.env.E2E_BASE_URL;

const QA_PARFUMS_VARIANT = "99002000-0000-4000-8000-000000000002";

function projectId() {
  const config = readFileSync(fileURLToPath(new URL("../../../supabase/config.toml", import.meta.url)), "utf8");
  const id = config.match(/^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m)?.[1];
  if (!id) throw new Error("Invalid local project id.");
  return id;
}

export function localSql(sql: string): string {
  if (!LOCAL_DB_AVAILABLE) throw new Error("localSql is restricted to the disposable local fixture stack.");
  const result = spawnSync(
    "docker",
    ["exec", "-i", `supabase_db_${projectId()}`, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"],
    { input: sql, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(`local SQL failed: ${result.stderr}`);
  return result.stdout.trim();
}

/**
 * Each mutating storefront test provisions exactly the one tracked unit it
 * is about to reserve (an atomic relative increment), so tests stay
 * independent of execution order, project (desktop/mobile) and parallelism:
 * no test can be starved by another having consumed a finite fixture.
 */
export function provisionQaParfumsUnit() {
  localSql(
    `update public.inventory set quantity_on_hand = quantity_on_hand + 1, availability_status = 'available'
      where product_variant_id = '${QA_PARFUMS_VARIANT}' and inventory_mode = 'tracked_quantity';`,
  );
}

/** Persistence side effects for one synthetic customer phone (unique per test). */
export function orderSideEffects(phone: string) {
  if (!/^\d{9,15}$/.test(phone)) throw new Error("phone must be digits only");
  const row = localSql(`
    with o as (select id from public.orders where customer_snapshot->>'phone' like '%${phone}')
    select (select count(*) from o),
           (select count(*) from public.notification_outbox n where n.entity_id in (select id from o)),
           (select count(*) from public.inventory_reservations r where r.order_id in (select id from o));`);
  const [orders, outbox, reservations] = row.split("|").map(Number);
  return { orders, outbox, reservations };
}
