import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEnvFile, validateQaTarget, qaMarkerGuardSql, isProductionRef, dockerPsqlArgs } from "./lib/qa-target.mjs";

const QA = "aqbhtmylqnpahynarnhm";
const PROD = "iyxidhglyqkzoziyewlc";
const valid = () => ({
  QA_PROJECT_REF: QA,
  NEXT_PUBLIC_SUPABASE_URL: `https://${QA}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  SUPABASE_SECRET_KEY: "sb_secret_x",
  QA_DATABASE_URL: `postgresql://qa_runner.${QA}:pw@aws-1-sa-east-1.pooler.supabase.com:5432/postgres`,
});

test("accepts a consistent QA env", () => {
  assert.equal(validateQaTarget(valid()).ref, QA);
});

test("refuses the Production ref even if every URL matches it", () => {
  const env = { ...valid(), QA_PROJECT_REF: PROD, NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co`,
    QA_DATABASE_URL: `postgresql://qa_runner.${PROD}:pw@aws-0-us-west-2.pooler.supabase.com:5432/postgres` };
  assert.throws(() => validateQaTarget(env), /Production/);
  assert.equal(isProductionRef(PROD), true);
});

test("refuses an API URL or database URL from another project", () => {
  assert.throws(() => validateQaTarget({ ...valid(), NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co` }), /does not belong/);
  assert.throws(() => validateQaTarget({ ...valid(),
    QA_DATABASE_URL: `postgresql://postgres.${PROD}:pw@aws-0-us-west-2.pooler.supabase.com:5432/postgres` }), /does not belong|Production/);
  assert.throws(() => validateQaTarget({ ...valid(), QA_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" }), /does not belong/);
});

test("refuses keys of the wrong kind and never echoes their values", () => {
  const env = { ...valid(), SUPABASE_SECRET_KEY: "eyJsecret-legacy-jwt-value" };
  assert.throws(() => validateQaTarget(env), (error) => /secret key/.test(error.message) && !error.message.includes("eyJsecret"));
  assert.throws(() => validateQaTarget({ ...valid(), NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" }), /publishable/);
  // The Supabase CLI masks secret keys unless --reveal is passed; such a value must fail fast, not as a 401 later.
  assert.throws(() => validateQaTarget({ ...valid(), SUPABASE_SECRET_KEY: "sb_secret_abcd·······" }), /masked/);
});

test("marker guard is ref-specific and cannot be built for Production", () => {
  assert.match(qaMarkerGuardSql(QA), new RegExp(`project_ref = '${QA}'`));
  assert.throws(() => qaMarkerGuardSql(PROD), /Invalid/);
  assert.throws(() => qaMarkerGuardSql("x'; drop table y; --"), /Invalid/);
});

test("env parser keeps only KEY=VALUE lines and the psql URL stays out of argv", () => {
  assert.deepEqual(parseEnvFile("# c\nA_B=1\nlower=2\nC= 3 \r\n"), { A_B: "1", C: "3" });
  assert.equal(dockerPsqlArgs().some((arg) => arg.includes("postgres://") || arg.includes("postgresql://")), false);
});

test("marker guard is a real psql meta-command prelude (QUIET on/off)", () => {
  const lines = qaMarkerGuardSql(QA).split("\n");
  assert.equal(lines[0], "\\set QUIET on");
  assert.ok(lines.includes("\\set QUIET off"));
});
