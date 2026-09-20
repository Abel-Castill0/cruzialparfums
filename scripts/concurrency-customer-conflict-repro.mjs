/** Two-session local concurrency reproduction for the Codex P1 #3 finding:
 * create_import_order_request's zero-match branch must re-resolve the
 * canonical active customer's ACTUAL status after a unique_violation
 * conflict, never assume 'new' just because this request's own insert lost
 * the race. See 20260920070000_import_order_auto_customer_linking.sql.
 *
 * This is a REAL two-connection reproduction (two concurrent `psql`
 * sessions against the local Supabase Postgres container), not two
 * sequential statements dressed up as concurrency: session T1 opens an
 * explicit transaction, mutates/inserts a customer row, and holds the
 * transaction open (pg_sleep) before committing; session T2 is started
 * mid-hold and its own INSERT genuinely blocks on Postgres's own unique-
 * index conflict detection until T1 commits or rolls back.
 *
 * Local-only diagnostic — not part of the pgTAP `npm run db:test` gate
 * (its timing is real wall-clock sleeps, which would make a CI-style gate
 * flaky). Run manually against a local `supabase start` stack:
 *
 *   node scripts/concurrency-customer-conflict-repro.mjs
 *
 * DESTRUCTIVE TO ITS LOCAL DB, BY DESIGN: it creates real orders, and
 * orders/order_lines can never be deleted (app.reject_order_history_
 * delete()) nor updated once past draft (app.freeze_order_snapshot() —
 * which also blocks the ON DELETE SET NULL cascade a parent delete would
 * trigger). That pins every fixture row this script creates (campaign,
 * product, presentation, offer, customer) permanently. This is the
 * immutable-commercial-history guarantee working as intended, not a bug
 * here — there is no SQL cleanup path. Only ever run this against a
 * disposable local `supabase start` stack, and run `npx supabase db
 * reset` afterward before relying on that DB for anything else (including
 * the pgTAP gate).
 *
 * Exits non-zero and prints a diagnostic on any assertion failure or SQL
 * error.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = readFileSync(resolve(root, "supabase/config.toml"), "utf8");
const project = config.match(/^project_id\s*=\s*"([a-zA-Z0-9_-]+)"\s*$/mu)?.[1];
if (!project) throw new Error("No safe local Supabase project_id.");
const container = `supabase_db_${project}`;

const IMPORT_UNIT = "22222222-2222-4222-8222-222222222222";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function runPsqlSync(sql) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-t", "-A"],
    { input: sql, encoding: "utf8", cwd: root },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`psql failed (sync):\n${sql}\n--- stderr ---\n${result.stderr}`);
  }
  return result.stdout;
}

function runPsqlAsync(sql, label) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      "docker",
      ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-t", "-A"],
      { cwd: root },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    child.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(new Error(`psql[${label}] failed (exit ${code}):\n${sql}\n--- stderr ---\n${stderr}`));
        return;
      }
      resolvePromise(stdout);
    });
    child.stdin.write(sql);
    child.stdin.end();
  });
}

let failures = 0;
function assertEqual(actual, expected, message) {
  const a = String(actual).trim();
  const e = String(expected).trim();
  if (a === e) {
    console.log(`  PASS: ${message}`);
  } else {
    failures += 1;
    console.error(`  FAIL: ${message} — expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
  }
}

async function withCampaignFixture({ campaignId, productId, presentationId, offerId, number }, run) {
  const preflight = runPsqlSync(
    `select count(*) from public.campaigns c join public.business_units u on u.id=c.business_unit_id
     where u.code='import' and c.status='open' and c.archived_at is null
       and (c.opens_at is null or c.opens_at<=now()) and (c.closes_at is null or c.closes_at>now());`,
  ).trim();
  if (preflight !== "0") {
    throw new Error(
      `Refusing to run: ${preflight} Import campaign(s) already eligible as "current" on this DB. ` +
        `This script needs exclusive control of app.public_import_campaign_id(). Run against a freshly reset local DB (npx supabase db reset).`,
    );
  }

  runPsqlSync(`
    begin;
    insert into public.products (id, business_unit_id, slug, name, brand, publication_status)
      values ('${productId}', '${IMPORT_UNIT}', 'concurrency-repro-${number}', 'Concurrency Repro ${number}', 'Brand', 'published');
    insert into public.import_presentations (id, product_id, stable_key, label, presentation_class, capacity_ml, publication_status)
      values ('${presentationId}', '${productId}', 'repro-${number}', '100 ml', 'single_fixed', 100, 'published');
    insert into public.campaigns (id, business_unit_id, number, name, status, opens_at, closes_at)
      values ('${campaignId}', '${IMPORT_UNIT}', ${number}, 'Concurrency Repro Campaign ${number}', 'open', now() - interval '1 hour', now() + interval '1 hour');
    insert into public.campaign_products (id, campaign_id, product_id, import_presentation_id, price_amount, availability_status, sort_order)
      values ('${offerId}', '${campaignId}', '${productId}', '${presentationId}', 100.00, 'available', 1);
    commit;
  `);

  // Once this fixture's offer is used by a created order, the campaign/
  // product/presentation/offer/customer rows can never be DELETEd — every
  // FK from the (permanently undeletable, per app.reject_order_history_
  // delete()) order back to them is ON DELETE SET NULL, but that cascade
  // is itself an UPDATE on the order row, which app.freeze_order_snapshot()
  // also blocks once the order is past draft. So this script cannot clean
  // up its rows; it only ARCHIVES the campaign afterward (campaigns have
  // no immutability trigger) so a later scenario/run doesn't collide with
  // it via app.public_import_campaign_id()'s "exactly one eligible open
  // campaign" rule. The fixture rows remain in the DB permanently — this
  // script must only run against a disposable local stack, followed by
  // `npx supabase db reset`.
  try {
    await run();
  } finally {
    runPsqlSync(`update public.campaigns set status = 'draft', archived_at = now() where id = '${campaignId}';`);
  }
}

function orderRequestSql({ requestId, phone, offerId, offerUpdatedAtExpr, name }) {
  return `
    select o.order_id, ord.order_number, ord.verified_customer_status_snapshot, ord.deposit_percentage_snapshot, ord.customer_id
    from public.create_import_order_request(
      '${requestId}'::uuid,
      jsonb_build_object('name', '${name}', 'phone', '${phone}'),
      jsonb_build_object('district', 'Lima', 'address', 'Av Repro 123'),
      jsonb_build_array(jsonb_build_object(
        'offer_id', '${offerId}',
        'offer_updated_at', (${offerUpdatedAtExpr}),
        'quantity', 1
      ))
    ) o
    join public.orders ord on ord.id = o.order_id;
  `;
}

// =============================================================================
// Scenario A — existing RETURNING customer's phone concurrently changes to
// collide with an in-flight zero-match order for that new phone.
// =============================================================================

async function scenarioA() {
  console.log("\n=== Scenario A: conflict recovery must read the winner's ACTUAL status (returning) ===");
  const campaignId = "aaaa1111-0000-4000-8000-000000000001";
  const productId = "aaaa1111-0000-4000-8000-000000000002";
  const presentationId = "aaaa1111-0000-4000-8000-000000000003";
  const offerId = "aaaa1111-0000-4000-8000-000000000004";
  const customerId = "aaaa1111-0000-4000-8000-000000000005";
  const targetPhone = "987000001";
  const oldPhone = "987000002";
  const requestId = "aaaa1111-0000-4000-8000-0000000000a1";

  await withCampaignFixture({ campaignId, productId, presentationId, offerId, number: 9001 }, async () => {
    runPsqlSync(`
      insert into public.customers (id, business_unit_id, full_name, phone, verified_customer_status, verified_at)
      values ('${customerId}', '${IMPORT_UNIT}', 'Returning Customer A', '${oldPhone}', 'returning', now());
    `);

    const offerUpdatedAtExpr = `select updated_at from public.campaign_products where id = '${offerId}'`;

    const t1 = runPsqlAsync(
      `begin;
       update public.customers set phone = '${targetPhone}' where id = '${customerId}';
       select pg_sleep(3);
       commit;`,
      "A-T1",
    );

    await sleep(1000);

    const t2 = runPsqlAsync(
      orderRequestSql({ requestId, phone: targetPhone, offerId, offerUpdatedAtExpr, name: "T2 Customer" }),
      "A-T2",
    );

    await Promise.all([t1, t2]);

    const row = runPsqlSync(
      `select verified_customer_status_snapshot || '|' || deposit_percentage_snapshot || '|' || customer_id
       from public.orders where request_id = '${requestId}';`,
    ).trim();
    const [status, deposit, linkedCustomerId] = row.split("|");

    assertEqual(status, "returning", "order snapshot status is 'returning' (the winner's ACTUAL status), not forced 'new'");
    assertEqual(deposit, "70.00", "deposit_percentage_snapshot is 70% (returning tier), not 50%");
    assertEqual(linkedCustomerId, customerId, "order links to the pre-existing returning customer, not a new row");

    const activeCount = runPsqlSync(
      `select count(*) from public.customers
       where business_unit_id = '${IMPORT_UNIT}' and app.normalize_import_phone(phone) = app.normalize_import_phone('${targetPhone}') and archived_at is null;`,
    ).trim();
    assertEqual(activeCount, "1", "exactly one active customer exists for the target phone after the conflict");
  });
}

// =============================================================================
// Scenario B — two concurrent GENUINELY NEW customers for the same phone.
// Whoever loses the race must link to the WINNER's pending_verification
// customer, and both orders must stay on new-customer (50%) semantics.
// =============================================================================

async function scenarioB() {
  console.log("\n=== Scenario B: concurrent first orders converge on ONE pending_verification customer, both stay 'new' ===");
  const campaignId = "bbbb2222-0000-4000-8000-000000000001";
  const productId = "bbbb2222-0000-4000-8000-000000000002";
  const presentationId = "bbbb2222-0000-4000-8000-000000000003";
  const offerId = "bbbb2222-0000-4000-8000-000000000004";
  const targetPhone = "987000003";
  // order_number is derived from the first 12 hex chars of the request id
  // (with dashes stripped) — these two must differ within that prefix or
  // both orders collide on orders_number_unique.
  const requestId1 = "bbbb2222-0000-4000-8000-0000000000b1";
  const requestId2 = "bbbc2222-0000-4000-8000-0000000000b2";

  await withCampaignFixture({ campaignId, productId, presentationId, offerId, number: 9002 }, async () => {
    const offerUpdatedAtExpr = `select updated_at from public.campaign_products where id = '${offerId}'`;

    const t1 = runPsqlAsync(
      `begin;
       ${orderRequestSql({ requestId: requestId1, phone: targetPhone, offerId, offerUpdatedAtExpr, name: "B1 Customer" })}
       select pg_sleep(3);
       commit;`,
      "B-T1",
    );

    await sleep(1000);

    const t2 = runPsqlAsync(
      orderRequestSql({ requestId: requestId2, phone: targetPhone, offerId, offerUpdatedAtExpr, name: "B2 Customer" }),
      "B-T2",
    );

    await Promise.all([t1, t2]);

    const rows = runPsqlSync(
      `select request_id || '|' || verified_customer_status_snapshot || '|' || deposit_percentage_snapshot || '|' || customer_id
       from public.orders where request_id in ('${requestId1}', '${requestId2}') order by request_id;`,
    ).trim().split("\n");

    if (rows.length !== 2) {
      failures += 1;
      console.error(`  FAIL: expected 2 orders, found ${rows.length}`);
    } else {
      const parsed = rows.map((r) => r.split("|"));
      const [status1, deposit1, customer1] = parsed[0].slice(1);
      const [status2, deposit2, customer2] = parsed[1].slice(1);
      assertEqual(status1, "new", "order 1 stays on new-customer semantics");
      assertEqual(status2, "new", "order 2 stays on new-customer semantics");
      assertEqual(deposit1, "50.00", "order 1 deposit is 50%");
      assertEqual(deposit2, "50.00", "order 2 deposit is 50%");
      assertEqual(customer1, customer2, "both orders link to the SAME customer (the race winner), not two different rows");
    }

    const activeCount = runPsqlSync(
      `select count(*) from public.customers
       where business_unit_id = '${IMPORT_UNIT}' and app.normalize_import_phone(phone) = app.normalize_import_phone('${targetPhone}') and archived_at is null;`,
    ).trim();
    assertEqual(activeCount, "1", "exactly one customer row exists for the target phone — no duplicate created");
  });
}

const started = Date.now();
let harnessError = null;
try {
  await scenarioA();
  await scenarioB();
} catch (err) {
  harnessError = err;
  console.error("\nReproduction harness error:", err.message);
}

const summary =
  harnessError ? "HARNESS ERROR" : failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`;
console.log(`\n${summary} — ${((Date.now() - started) / 1000).toFixed(1)}s`);
if (harnessError || failures > 0) process.exitCode = 1;
