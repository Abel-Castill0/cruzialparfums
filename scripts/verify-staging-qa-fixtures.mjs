// Targeted 4J5F-A read-only verification. Run from repository root:
// node scripts/verify-staging-qa-fixtures.mjs
// Uses installed TypeScript/Next runtime; no new dependencies or testing framework.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";
const ref = "iyxidhglyqkzoziyewlc";
assert.equal(readFileSync("supabase/.temp/project-ref","utf8").trim(),ref);
const sql = `
select p.slug, to_jsonb(p) || jsonb_build_object(
 'notes', p.specs->'notes', 'tag', p.specs->>'tag',
 'product_variants',coalesce((select jsonb_agg(to_jsonb(v)) from public.product_variants v where v.product_id=p.id),'[]'::jsonb),
 'product_media',coalesce((select jsonb_agg(to_jsonb(m)) from public.product_media m where m.product_id=p.id),'[]'::jsonb),
 'product_categories',coalesce((select jsonb_agg(jsonb_build_object('category',to_jsonb(c)))
 from public.product_categories pc join public.categories c on c.id=pc.category_id where pc.product_id=p.id),'[]'::jsonb)
) as mapping_row from public.products p
where p.business_unit_id='11111111-1111-4111-8111-111111111111'
and p.brand='[STAGING QA]' and p.slug in('staging-qa-publishable','staging-qa-blocked-media','staging-qa-blocked-variant')
order by p.slug;
`;
// PowerShell passes the SQL as one literal argument; no credentials are used.
const shell = process.platform === "win32" ? "powershell.exe" : null;
const args = ["--no-install","supabase","db","query","--linked","--project-ref",ref,sql.replaceAll("\n"," ").trim()];
const r = shell
 ? spawnSync(shell,["-NoProfile","-Command", "npx " + args.map(x=>"'"+x.replaceAll("'","''")+"'").join(" ")],{encoding:"utf8",windowsHide:true})
 : spawnSync("npx",args,{encoding:"utf8"});
assert.equal(r.status,0,"Read-only staging query failed: " + (r.stderr + r.stdout).slice(-1600));
const raw = r.stdout.slice(r.stdout.indexOf("{"));
const result = JSON.parse(raw);
assert.ok(!result.error,"Staging query returned error");
assert.equal(result.rows.length,3);
const require = createRequire(new URL("../apps/web/package.json",import.meta.url));
const ts = require("typescript");
const source = readFileSync("apps/web/src/domains/catalog/supabase-public-catalog-repository.ts","utf8");
const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports = {};
runInNewContext(compiled,{exports});
const mapped = new Map(result.rows.map(r=>[r.slug,exports.mapPublicProduct(r.mapping_row)]));
const ready = mapped.get("staging-qa-publishable");
assert.ok(ready);
assert.equal(ready.variants.length,1);
assert.equal(ready.variants[0].priceAmount,"0.01");
// Public Parfums intentionally maps only HTTPS Cloudinary media. This fixture
// proves the structural mapping contract, not a Cloudinary/public-media cutover.
assert.equal(ready.imageUrl,null);
const qaMedia = result.rows.find(r=>r.slug==='staging-qa-publishable').mapping_row.product_media[0].secure_url;
assert.ok(qaMedia.startsWith("data:image/svg+xml,"));
assert.equal(mapped.get("staging-qa-blocked-media").imageUrl,null);
assert.equal(mapped.get("staging-qa-blocked-variant"),null);
const { getImageProps } = require("next/image");
const image = getImageProps({src:qaMedia,alt:"[STAGING QA]",width:160,height:160});
assert.equal(image.props.src,qaMedia);
assert.ok(!image.props.srcSet,"Synthetic media must not use a remote optimizer");
const cleanup = readFileSync("supabase/provisioning/staging-qa-fixtures-cleanup.sql","utf8");
assert.ok(!/\blike\b/i.test(cleanup),"Cleanup must have no wildcard selectors");
assert.ok(cleanup.includes("md5('4J5F-A/offer/'||q.slug)::uuid"));
assert.ok(cleanup.includes("p.name=q.name"));
console.log("PASS: 3 actual Parfums mappings; Next Image data URI; exact cleanup selectors");

// 4J5G-A3: campaign 9002 ([STAGING QA] Open) public QA link, read-only.
const c9002Sql = `
select
 (select count(*) from public.campaign_products cp join public.campaigns c on c.id=cp.campaign_id
   where c.business_unit_id='22222222-2222-4222-8222-222222222222' and c.number=9002) as c9002_offers,
 (select p.slug from public.campaign_products cp join public.campaigns c on c.id=cp.campaign_id
   join public.products p on p.id=cp.product_id
   where c.business_unit_id='22222222-2222-4222-8222-222222222222' and c.number=9002) as c9002_product_slug,
 (select count(*) from public.campaign_products where id='a232ab79-7a07-77d0-076d-b9d888cd61e3'
   and price_amount=0.01 and availability_status='available') as c6_qa_offer_intact;
`;
const c9002Args = ["--no-install","supabase","db","query","--linked","--project-ref",ref,c9002Sql.replaceAll("\n"," ").trim()];
const r9002 = shell
 ? spawnSync(shell,["-NoProfile","-Command","npx " + c9002Args.map(x=>"'"+x.replaceAll("'","''")+"'").join(" ")],{encoding:"utf8",windowsHide:true})
 : spawnSync("npx",c9002Args,{encoding:"utf8"});
assert.equal(r9002.status,0,"Read-only campaign 9002 query failed: " + (r9002.stderr + r9002.stdout).slice(-1600));
const result9002 = JSON.parse(r9002.stdout.slice(r9002.stdout.indexOf("{")));
assert.ok(!result9002.error,"Campaign 9002 query returned error");
const row9002 = result9002.rows[0];
assert.equal(row9002.c9002_offers, 1, "Campaign 9002 must have exactly one QA public offer");
assert.equal(row9002.c9002_product_slug, "staging-qa-import-ready");
assert.equal(row9002.c6_qa_offer_intact, 1, "Campaign #6 QA offer for staging-qa-import-ready must remain intact");
const link = readFileSync("supabase/provisioning/staging-qa-fixtures-campaign-9002-link.sql","utf8");
assert.ok(!/\blike\b/i.test(link), "9002 link fixture must have no wildcard selectors");
assert.ok(cleanup.includes("md5('4J5G-A3/offer/staging-qa-import-ready-9002')::uuid"));
console.log("PASS: campaign 9002 has exactly one QA offer (staging-qa-import-ready); campaign #6 unchanged");
