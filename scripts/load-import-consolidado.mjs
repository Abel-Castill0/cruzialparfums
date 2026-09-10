/**
 * Cruzial Platform V2 — deterministic, fail-closed Sexto population operator.
 *
 * Local uses the local Supabase PostgreSQL container. Hosted staging requires
 * CRUZIAL_STAGING_DATABASE_URL and verifies that the connection identity names
 * project iyxidhglyqkzoziyewlc. The credential is never printed and there is no
 * staging-to-local fallback. Production is not a supported target.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildCanonicalManifest, buildPopulationPlan, CAMPAIGN_NAME, CAMPAIGN_NUMBER, PLAN_VERSION } from "./lib/import-consolidado-plan.mjs";

export const STAGING_PROJECT_ID = "iyxidhglyqkzoziyewlc";
export const STAGING_DATABASE_URL_ENV = "CRUZIAL_STAGING_DATABASE_URL";
const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "..");
const reviewedPath = resolve(repoRoot, "supabase/staging/import/sexto-consolidado-reviewed.json");
const overridesPath = resolve(repoRoot, "supabase/staging/import/sexto-consolidado-population-overrides.json");
const configPath = resolve(repoRoot, "supabase/config.toml");

export function parseArgs(argv) {
  const args = argv.slice(2);
  const targetIndex = args.indexOf("--target");
  if (targetIndex === -1 || !args[targetIndex + 1]) throw new Error("Specify --target local|staging. The target is never inferred.");
  const target = args[targetIndex + 1];
  const modes = ["--dry-run", "--precheck", "--apply", "--verify"].filter((mode) => args.includes(mode));
  if (!["local", "staging"].includes(target)) throw new Error("Target must be local or staging; Production is unsupported.");
  if (modes.length !== 1) throw new Error("Choose exactly one: --dry-run, --precheck, --apply, or --verify.");
  return { target, mode: modes[0].slice(2) };
}

function localContainer() {
  const match = readFileSync(configPath, "utf8").match(/^project_id\s*=\s*"([a-zA-Z0-9_-]+)"\s*$/mu);
  if (!match) throw new Error("supabase/config.toml has no safe project_id.");
  return `supabase_db_${match[1]}`;
}

export function validateStagingDatabaseUrl(rawUrl) {
  if (!rawUrl) throw new Error(`${STAGING_DATABASE_URL_ENV} is required for hosted staging. Set it in the secure operator environment; do not paste it into chat.`);
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new Error(`${STAGING_DATABASE_URL_ENV} is not a valid PostgreSQL URL.`); }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new Error(`${STAGING_DATABASE_URL_ENV} must use postgres:// or postgresql://.`);
  const hostname = parsed.hostname.toLowerCase();
  const username = decodeURIComponent(parsed.username).toLowerCase();
  const isDirect = hostname === `db.${STAGING_PROJECT_ID}.supabase.co`;
  const isPooler = hostname.endsWith(".pooler.supabase.com") && username === `postgres.${STAGING_PROJECT_ID}`;
  if (!isDirect && !isPooler) {
    throw new Error(`${STAGING_DATABASE_URL_ENV} does not identify hosted staging project ${STAGING_PROJECT_ID}. Refusing to connect.`);
  }
  return rawUrl;
}

export function resolveTarget(target, env = process.env) {
  if (target === "local") {
    const container = localContainer();
    return { target, container, label: `local Supabase Docker (${container})` };
  }
  return { target, databaseUrl: validateStagingDatabaseUrl(env[STAGING_DATABASE_URL_ENV]), label: `hosted Supabase staging (${STAGING_PROJECT_ID})` };
}

function run(command, args, input) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || `${command} exited ${result.status}`).trim();
    throw new Error(message.replace(/postgres(?:ql)?:\/\/[^\s@]+@/giu, "postgresql://[REDACTED]@"));
  }
  return result.stdout.trim();
}

function executeSql(target, sql) {
  const psqlArgs = ["psql", "--username=postgres", "--dbname=postgres", "--quiet", "--no-align", "--tuples-only", "--set=ON_ERROR_STOP=1"];
  if (target.target === "local") {
    if (run("docker", ["inspect", "--format={{.State.Running}}", target.container]) !== "true") throw new Error(`Local database container is not running: ${target.container}`);
    return run("docker", ["exec", "-i", target.container, ...psqlArgs], sql);
  }
  return run("docker", ["run", "--rm", "-i", "postgres:17-alpine", "psql", target.databaseUrl, "--quiet", "--no-align", "--tuples-only", "--set=ON_ERROR_STOP=1"], sql);
}

function sqlLiteral(value) { return `'${String(value).replaceAll("'", "''")}'`; }

function expectedTablesSql(manifest) {
  const payload = JSON.stringify(manifest);
  if (payload.includes("$plan$")) throw new Error("Unexpected SQL delimiter in canonical plan.");
  return `
CREATE TEMP TABLE _plan_manifest AS SELECT $plan$${payload}$plan$::jsonb AS value;
CREATE TEMP TABLE _plan_categories (slug text primary key, name text not null);
INSERT INTO _plan_categories VALUES ('import-designer','Designer'),('import-niche','Niche'),('import-arabic','Arabic');
CREATE TEMP TABLE _plan_products AS
SELECT x.*, CASE x.import_segment WHEN 'designer' THEN 'import-designer' WHEN 'niche' THEN 'import-niche' ELSE 'import-arabic' END AS category_slug
FROM _plan_manifest m, jsonb_to_recordset(m.value->'products') AS x(canonical_id text,slug text,name text,brand text,import_segment text,presentation_class text,provenance text,source_records jsonb,override_references jsonb);
CREATE UNIQUE INDEX ON _plan_products(canonical_id); CREATE UNIQUE INDEX ON _plan_products(slug);
CREATE TEMP TABLE _plan_presentations AS
SELECT x.*, jsonb_build_object('provenance',x.provenance,'source_record_ids',coalesce(x.source_records,'[]'::jsonb),'override_references',coalesce(x.override_references,'[]'::jsonb)) AS source_metadata
FROM _plan_manifest m, jsonb_to_recordset(m.value->'presentations') AS x(product_canonical_id text,stable_key text,label text,capacity_ml numeric,presentation_class text,provenance text,source_records jsonb,override_references jsonb);
CREATE UNIQUE INDEX ON _plan_presentations(product_canonical_id,stable_key);
CREATE TEMP TABLE _plan_offers AS
SELECT x.value->>'product_canonical_id' AS product_canonical_id,x.value->>'pres_stable_key' AS pres_stable_key,x.value->>'price_amount' AS price_amount,x.value->>'availability_status' AS availability_status,x.value->>'provenance' AS provenance,x.value->'source_records' AS source_records,x.value->'override_references' AS override_references,x.ordinality::integer-1 AS sort_order
FROM _plan_manifest m, jsonb_array_elements(m.value->'offers') WITH ORDINALITY AS x(value,ordinality);
CREATE UNIQUE INDEX ON _plan_offers(product_canonical_id,pres_stable_key);
DO $validate$ DECLARE m jsonb := (SELECT value FROM _plan_manifest); BEGIN
 IF m->>'schema_version' <> ${sqlLiteral(PLAN_VERSION)} THEN RAISE EXCEPTION 'unexpected plan version'; END IF;
 IF m#>>'{campaign,business_unit}' <> 'import' OR (m#>>'{campaign,number}')::integer <> ${CAMPAIGN_NUMBER} OR m#>>'{campaign,name}' <> ${sqlLiteral(CAMPAIGN_NAME)} THEN RAISE EXCEPTION 'unexpected campaign semantic identity'; END IF;
 IF m->>'reviewed_sha256' <> '428d7f47c0a713d7593b8e2618664570dfcecee8b424e6215dfb08b6b27943c2' THEN RAISE EXCEPTION 'reviewed artifact SHA drift'; END IF;
 IF (SELECT count(*) FROM _plan_products)>1000 OR (SELECT count(*) FROM _plan_presentations)>1500 OR (SELECT count(*) FROM _plan_offers)>1500 THEN RAISE EXCEPTION 'operator payload exceeds hard bounds'; END IF;
 IF EXISTS(SELECT 1 FROM _plan_offers WHERE price_amount !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$') THEN RAISE EXCEPTION 'invalid exact decimal price text'; END IF;
 IF EXISTS(SELECT 1 FROM _plan_offers WHERE availability_status NOT IN ('unconfirmed','available','out_of_stock')) THEN RAISE EXCEPTION 'invalid availability'; END IF;
END $validate$;`;
}

function conflictFunctionSql() {
  return `
CREATE OR REPLACE FUNCTION pg_temp.population_conflicts() RETURNS jsonb LANGUAGE sql AS $report$
WITH u AS (SELECT id FROM public.business_units WHERE code='import'), c AS (SELECT c.* FROM public.campaigns c,u WHERE c.business_unit_id=u.id AND c.number=${CAMPAIGN_NUMBER}),
category_drift AS (SELECT count(*)::int n FROM _plan_categories e JOIN public.categories x ON x.business_unit_id=(SELECT id FROM u) AND x.slug=e.slug WHERE x.kind<>'import_category' OR x.name<>e.name OR x.parent_id IS NOT NULL OR x.description IS NOT NULL OR x.spec_schema<>'{}'::jsonb OR x.publication_status<>'draft' OR x.sort_order<>0 OR x.archived_at IS NOT NULL),
campaign_drift AS (SELECT count(*)::int n FROM c WHERE name<>${sqlLiteral(CAMPAIGN_NAME)} OR status<>'draft' OR opens_at IS NOT NULL OR closes_at IS NOT NULL OR public_message IS NOT NULL OR archived_at IS NOT NULL),
identity_drift AS (SELECT count(*)::int n FROM _plan_products e JOIN public.products p ON p.business_unit_id=(SELECT id FROM u) AND (p.slug=e.slug OR p.legacy_id=e.canonical_id) WHERE p.slug<>e.slug OR p.legacy_id IS DISTINCT FROM e.canonical_id),
product_drift AS (SELECT count(*)::int n FROM _plan_products e JOIN public.products p ON p.business_unit_id=(SELECT id FROM u) AND p.slug=e.slug WHERE p.legacy_id IS DISTINCT FROM e.canonical_id OR p.name<>e.name OR p.brand IS DISTINCT FROM e.brand OR p.short_description IS NOT NULL OR p.description IS NOT NULL OR p.gender IS NOT NULL OR p.concentration IS NOT NULL OR p.sales_mode<>'campaign' OR p.production_status<>'active' OR p.availability_status<>'available' OR p.publication_status<>'draft' OR p.is_featured OR p.featured_rank IS NOT NULL OR p.featured_from IS NOT NULL OR p.featured_until IS NOT NULL OR p.verification_status<>'official_pdf' OR p.specs<>'{}'::jsonb OR p.archived_at IS NOT NULL),
category_link_drift AS (SELECT count(*)::int n FROM _plan_products e JOIN public.products p ON p.business_unit_id=(SELECT id FROM u) AND p.slug=e.slug WHERE NOT EXISTS(SELECT 1 FROM public.product_categories pc JOIN public.categories x ON x.id=pc.category_id WHERE pc.product_id=p.id AND x.business_unit_id=p.business_unit_id AND x.kind='import_category' AND x.slug=e.category_slug AND pc.sort_order=0) OR EXISTS(SELECT 1 FROM public.product_categories pc JOIN public.categories x ON x.id=pc.category_id WHERE pc.product_id=p.id AND x.kind='import_category' AND x.slug<>e.category_slug)),
presentation_drift AS (SELECT
 (SELECT count(*) FROM _plan_presentations e JOIN _plan_products ep ON ep.canonical_id=e.product_canonical_id JOIN public.products p ON p.business_unit_id=(SELECT id FROM u) AND p.slug=ep.slug JOIN public.import_presentations ip ON ip.product_id=p.id AND ip.stable_key=e.stable_key WHERE ip.label<>e.label OR ip.presentation_class<>e.presentation_class OR ip.capacity_ml IS DISTINCT FROM e.capacity_ml OR ip.composition IS NOT NULL OR ip.source_metadata<>e.source_metadata OR ip.publication_status<>'draft' OR ip.archived_at IS NOT NULL)
 +(SELECT count(*) FROM _plan_products ep JOIN public.products p ON p.business_unit_id=(SELECT id FROM u) AND p.slug=ep.slug JOIN public.import_presentations ip ON ip.product_id=p.id LEFT JOIN _plan_presentations e ON e.product_canonical_id=ep.canonical_id AND e.stable_key=ip.stable_key WHERE e.stable_key IS NULL) AS n),
offer_drift AS (SELECT count(*)::int n FROM (
 SELECT e.product_canonical_id,e.pres_stable_key,e.price_amount::numeric expected_price,e.availability_status expected_availability,e.sort_order expected_sort,cp.id,cp.price_amount actual_price,cp.availability_status actual_availability,cp.currency,cp.quantity_limit,cp.product_variant_id,cp.sort_order actual_sort
 FROM _plan_offers e LEFT JOIN _plan_products ep ON ep.canonical_id=e.product_canonical_id LEFT JOIN public.products p ON p.business_unit_id=(SELECT id FROM u) AND p.slug=ep.slug LEFT JOIN public.import_presentations ip ON ip.product_id=p.id AND ip.stable_key=e.pres_stable_key LEFT JOIN c ON true LEFT JOIN public.campaign_products cp ON cp.campaign_id=c.id AND cp.product_id=p.id AND cp.import_presentation_id=ip.id
 UNION ALL
 SELECT NULL,NULL,NULL,NULL,NULL,cp.id,cp.price_amount,cp.availability_status,cp.currency,cp.quantity_limit,cp.product_variant_id,cp.sort_order FROM c JOIN public.campaign_products cp ON cp.campaign_id=c.id LEFT JOIN public.products p ON p.id=cp.product_id LEFT JOIN public.import_presentations ip ON ip.id=cp.import_presentation_id LEFT JOIN _plan_products ep ON ep.slug=p.slug LEFT JOIN _plan_offers e ON e.product_canonical_id=ep.canonical_id AND e.pres_stable_key=ip.stable_key WHERE e.product_canonical_id IS NULL
 ) q WHERE EXISTS(SELECT 1 FROM c) AND (q.id IS NULL OR q.actual_price IS DISTINCT FROM q.expected_price OR q.actual_availability IS DISTINCT FROM q.expected_availability OR q.currency IS DISTINCT FROM 'PEN' OR q.quantity_limit IS NOT NULL OR q.product_variant_id IS NOT NULL OR q.actual_sort IS DISTINCT FROM q.expected_sort))
SELECT jsonb_build_object('category_drift',(SELECT n FROM category_drift),'campaign_drift',(SELECT n FROM campaign_drift),'campaign_count',(SELECT count(*)::int FROM c),'product_identity_collision',(SELECT n FROM identity_drift),'product_drift',(SELECT n FROM product_drift),'product_category_drift',(SELECT n FROM category_link_drift),'presentation_drift',(SELECT n FROM presentation_drift),'offer_drift',(SELECT n FROM offer_drift));
$report$;`;
}

function reportSql() {
  return `WITH u AS(SELECT id FROM public.business_units WHERE code='import'),c AS(SELECT c.id FROM public.campaigns c,u WHERE c.business_unit_id=u.id AND c.number=${CAMPAIGN_NUMBER}) SELECT jsonb_build_object(
'conflicts',pg_temp.population_conflicts(),
'products',(SELECT count(*)::int FROM _plan_products e JOIN public.products p ON p.business_unit_id=(SELECT id FROM u) AND p.slug=e.slug),
'presentations',(SELECT count(*)::int FROM _plan_presentations e JOIN _plan_products ep ON ep.canonical_id=e.product_canonical_id JOIN public.products p ON p.business_unit_id=(SELECT id FROM u) AND p.slug=ep.slug JOIN public.import_presentations ip ON ip.product_id=p.id AND ip.stable_key=e.stable_key),
'offers',(SELECT count(*)::int FROM c JOIN public.campaign_products cp ON cp.campaign_id=c.id),
'expected_products',(SELECT count(*)::int FROM _plan_products),'expected_presentations',(SELECT count(*)::int FROM _plan_presentations),'expected_offers',(SELECT count(*)::int FROM _plan_offers),
'availability',(SELECT coalesce(jsonb_object_agg(s.availability_status,s.n),'{}'::jsonb) FROM(SELECT cp.availability_status,count(*)::int n FROM c JOIN public.campaign_products cp ON cp.campaign_id=c.id GROUP BY cp.availability_status)s),
'vanilla_freak',(SELECT jsonb_build_object('products',count(DISTINCT p.id),'presentations',count(DISTINCT ip.id),'offers',count(DISTINCT cp.id)) FROM public.products p LEFT JOIN public.import_presentations ip ON ip.product_id=p.id LEFT JOIN c ON true LEFT JOIN public.campaign_products cp ON cp.campaign_id=c.id AND cp.product_id=p.id WHERE p.business_unit_id=(SELECT id FROM u) AND p.slug='import-vanilla-freak-a2d9b01f'),
'cdn_preciux_iv',(SELECT jsonb_build_object('products',count(DISTINCT p.id),'presentations',count(DISTINCT ip.id),'offers',count(DISTINCT cp.id)) FROM public.products p LEFT JOIN public.import_presentations ip ON ip.product_id=p.id LEFT JOIN c ON true LEFT JOIN public.campaign_products cp ON cp.campaign_id=c.id AND cp.product_id=p.id WHERE p.business_unit_id=(SELECT id FROM u) AND p.slug='import-cdn-preciux-iv-63f7d95b'))::text;`;
}

function publicRlsSql() {
  return `GRANT SELECT ON _plan_products,_plan_presentations,_plan_offers TO anon; SET LOCAL ROLE anon;
WITH u AS(SELECT id FROM public.business_units WHERE code='import'),c AS(SELECT id FROM public.campaigns WHERE business_unit_id=(SELECT id FROM u) AND number=${CAMPAIGN_NUMBER}) SELECT jsonb_build_object(
'products',(SELECT count(*)::int FROM public.products p JOIN _plan_products e ON e.slug=p.slug WHERE p.business_unit_id=(SELECT id FROM u)),
'presentations',(SELECT count(*)::int FROM public.import_presentations ip JOIN public.products p ON p.id=ip.product_id JOIN _plan_products ep ON ep.slug=p.slug JOIN _plan_presentations e ON e.product_canonical_id=ep.canonical_id AND e.stable_key=ip.stable_key),
'campaign_offers',(SELECT count(*)::int FROM public.campaign_products cp JOIN c ON c.id=cp.campaign_id))::text; RESET ROLE;`;
}

function applySql() {
  return `DO $guard$ DECLARE r jsonb:=pg_temp.population_conflicts(); BEGIN IF (r->>'category_drift')::int+(r->>'campaign_drift')::int+(r->>'product_identity_collision')::int+(r->>'product_drift')::int+(r->>'product_category_drift')::int+(r->>'presentation_drift')::int+(r->>'offer_drift')::int>0 THEN RAISE EXCEPTION '4J4B drift detected: %',r USING ERRCODE='P0001'; END IF; END $guard$;
WITH u AS(SELECT id FROM public.business_units WHERE code='import') INSERT INTO public.categories(business_unit_id,kind,slug,name,publication_status) SELECT u.id,'import_category',e.slug,e.name,'draft' FROM u CROSS JOIN _plan_categories e WHERE NOT EXISTS(SELECT 1 FROM public.categories x WHERE x.business_unit_id=u.id AND x.slug=e.slug);
WITH u AS(SELECT id FROM public.business_units WHERE code='import') INSERT INTO public.campaigns(business_unit_id,number,name,status,opens_at,closes_at,public_message) SELECT u.id,${CAMPAIGN_NUMBER},${sqlLiteral(CAMPAIGN_NAME)},'draft',NULL,NULL,NULL FROM u WHERE NOT EXISTS(SELECT 1 FROM public.campaigns c WHERE c.business_unit_id=u.id AND c.number=${CAMPAIGN_NUMBER});
WITH u AS(SELECT id FROM public.business_units WHERE code='import') INSERT INTO public.products(business_unit_id,legacy_id,slug,name,brand,sales_mode,production_status,availability_status,publication_status,verification_status) SELECT u.id,e.canonical_id,e.slug,e.name,e.brand,'campaign','active','available','draft','official_pdf' FROM u CROSS JOIN _plan_products e WHERE NOT EXISTS(SELECT 1 FROM public.products p WHERE p.business_unit_id=u.id AND p.slug=e.slug);
WITH u AS(SELECT id FROM public.business_units WHERE code='import') INSERT INTO public.product_categories(product_id,category_id,sort_order) SELECT p.id,c.id,0 FROM _plan_products e JOIN u ON true JOIN public.products p ON p.business_unit_id=u.id AND p.slug=e.slug JOIN public.categories c ON c.business_unit_id=u.id AND c.slug=e.category_slug WHERE NOT EXISTS(SELECT 1 FROM public.product_categories pc WHERE pc.product_id=p.id AND pc.category_id=c.id);
WITH u AS(SELECT id FROM public.business_units WHERE code='import') INSERT INTO public.import_presentations(product_id,stable_key,label,presentation_class,capacity_ml,composition,source_metadata,publication_status) SELECT p.id,e.stable_key,e.label,e.presentation_class,e.capacity_ml,NULL,e.source_metadata,'draft' FROM _plan_presentations e JOIN _plan_products ep ON ep.canonical_id=e.product_canonical_id JOIN u ON true JOIN public.products p ON p.business_unit_id=u.id AND p.slug=ep.slug WHERE NOT EXISTS(SELECT 1 FROM public.import_presentations ip WHERE ip.product_id=p.id AND ip.stable_key=e.stable_key);
WITH u AS(SELECT id FROM public.business_units WHERE code='import'),c AS(SELECT c.id FROM public.campaigns c,u WHERE c.business_unit_id=u.id AND c.number=${CAMPAIGN_NUMBER}) INSERT INTO public.campaign_products(campaign_id,product_id,product_variant_id,import_presentation_id,price_amount,currency,availability_status,quantity_limit,sort_order) SELECT c.id,p.id,NULL,ip.id,e.price_amount::numeric,'PEN',e.availability_status,NULL,e.sort_order FROM _plan_offers e JOIN _plan_products ep ON ep.canonical_id=e.product_canonical_id JOIN u ON true JOIN public.products p ON p.business_unit_id=u.id AND p.slug=ep.slug JOIN public.import_presentations ip ON ip.product_id=p.id AND ip.stable_key=e.pres_stable_key CROSS JOIN c WHERE NOT EXISTS(SELECT 1 FROM public.campaign_products cp WHERE cp.campaign_id=c.id AND cp.product_id=p.id AND cp.import_presentation_id=ip.id);`;
}

export function buildOperatorSql(manifest, mode) {
  const common = `BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('cruzial:4j4b:sexto',0));${expectedTablesSql(manifest)}${conflictFunctionSql()}`;
  return mode === "apply" ? `${common}${applySql()}${reportSql()}${publicRlsSql()}COMMIT;` : `${common}${reportSql()}${publicRlsSql()}ROLLBACK;`;
}

function parseJsonLines(output) { return output.split(/\r?\n/u).map((line)=>line.trim()).filter((line)=>line.startsWith("{")).map((line)=>JSON.parse(line)); }
function totalConflicts(report) { return Object.entries(report.conflicts).filter(([key])=>key!=="campaign_count").reduce((sum,[,value])=>sum+Number(value),0); }

export async function loadPlan() {
  const reviewedRaw=await readFile(reviewedPath,"utf8"); const overridesRaw=await readFile(overridesPath,"utf8");
  const reviewed=JSON.parse(reviewedRaw); const overrides=JSON.parse(overridesRaw);
  reviewed._sha256=createHash("sha256").update(reviewedRaw).digest("hex"); overrides._sha256=createHash("sha256").update(overridesRaw).digest("hex");
  const plan=buildPopulationPlan(reviewed,overrides); return {plan,manifest:buildCanonicalManifest(reviewed,overrides,plan)};
}

export async function main(argv=process.argv,env=process.env) {
  const {target:targetName,mode}=parseArgs(argv); const {plan,manifest}=await loadPlan();
  console.log(`[4J4B] Plan ${PLAN_VERSION}: ${plan.stats.products} products, ${plan.stats.structural_presentations} presentations, ${plan.stats.priced_offers} offers, ${plan.skipped.length} skipped offers.`);
  if(mode==="dry-run"){console.log(`[4J4B] Target requested: ${targetName}. Dry run is plan-only; no credential or database connection used.`);return;}
  const target=resolveTarget(targetName,env); console.log(`[4J4B] TARGET: ${target.label}`); console.log(`[4J4B] MODE: ${mode}`);
  const [report,publicRls]=parseJsonLines(executeSql(target,buildOperatorSql(manifest,mode)));
  if(!report||!publicRls) throw new Error("Operator database response was incomplete.");
  console.log(`[4J4B] Database report: ${JSON.stringify(report)}`); console.log(`[4J4B] Anonymous RLS report: ${JSON.stringify(publicRls)}`);
  const conflicts=totalConflicts(report); if(conflicts!==0) throw new Error(`Fail-closed drift detected (${conflicts} conflicts). No changes were made.`);
  if(mode!=="precheck"&&(report.products!==report.expected_products||report.presentations!==report.expected_presentations||report.offers!==report.expected_offers)) throw new Error("Plan-scoped count verification failed.");
  if(mode!=="precheck"&&Object.values(publicRls).some((count)=>count!==0)) throw new Error("Anonymous RLS verification failed.");
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){main().catch((error)=>{console.error(`[4J4B] FATAL: ${error.message}`);process.exitCode=1;});}
