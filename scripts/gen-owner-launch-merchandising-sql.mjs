/**
 * Generates supabase/provisioning/parfums-owner-launch-merchandising.sql from the
 * committed research artifacts and the Liquid Brun upload result, so the SQL's
 * prices and evidence are copied from source and never retyped.
 *
 *   node scripts/gen-owner-launch-merchandising-sql.mjs <liquid-brun-upload.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const uploadPath = process.argv[2];
if (!uploadPath) throw new Error("usage: <liquid-brun-upload.json>");
const research = JSON.parse(readFileSync(resolve(root, "supabase/staging/bottle-market-research.json"), "utf8"));
const media = JSON.parse(readFileSync(uploadPath, "utf8"));

// identity, size AND concentration CONFIRMED in bottle-identity-audit.json + >= 2 credible Peru sources
const WANTED = [
  ["9pm", 100], ["adg-profondo-edp", 100], ["asad-elixir", 100], ["b-man-in-black", 100], ["cdn-intense-man", 105],
  ["dylan-blue", 100], ["erba-pura", 100], ["erba-pura", 50], ["eros-edt", 100], ["hawas-ice", 100],
  ["khamrah-clasico", 100], ["le-male-elixir", 75], ["liquid-brun", 100], ["m-red-tobacco", 120],
  ["sauvage-edt", 100], ["spicebomb-extreme", 90], ["tmw-parfum", 100], ["ultra-male", 125],
];
const audit = JSON.parse(readFileSync(resolve(root, "supabase/staging/bottle-identity-audit.json"), "utf8")).entries;

const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
const priceRows = WANTED.map(([slug, size]) => {
  const matches = research.entries.filter((entry) => entry.legacy_id === slug && Number(entry.size_ml) === size);
  if (matches.length !== 1) throw new Error(`research entry count for ${slug} ${size}: ${matches.length}`);
  const entry = matches[0];
  const observations = (entry.observations ?? []).filter((o) => o.observed_price_pen !== null).map((o) => ({
    source: o.source_name, price_pen: o.observed_price_pen, seller_type: o.seller_type, date: o.observation_date,
  }));
  if (observations.length < 2) throw new Error(`${slug} ${size}: fewer than 2 credible sources`);
  const auditEntry = audit.find((a) => a.legacy_id === slug && Number(a.current_size_ml) === size);
  if (!auditEntry || auditEntry.identity_status !== "IDENTITY_CONFIRMED" || auditEntry.size_status !== "SIZE_CONFIRMED"
    || auditEntry.concentration_status !== "CONCENTRATION_CONFIRMED") throw new Error(`${slug} ${size}: not fully confirmed in audit`);
  const evidence = {
    source: "supabase/staging/bottle-market-research.json", research_date: research.research_date,
    confidence: entry.confidence, selection_method: entry.selection_method,
    selected_reference_pen: entry.selected_reference_pen, observations,
  };
  return `  (${q(slug)}, ${size}, ${entry.selected_reference_pen}, ${q(JSON.stringify(evidence))}::jsonb)`;
}).join(",\n");

const mediaRows = media.map((m, i) => `  (${q(m.role)}, ${i}, ${q(m.publicId)}, ${q(m.secureUrl)}, ${m.width}, ${m.height}, ${m.bytes}, ${q(m.format)}, ${q(m.sha256)}, ${q(m.sourceFile)})`).join(",\n");

const template = readFileSync(resolve(root, "scripts/owner-launch-merchandising.template.sql"), "utf8");
const sql = template.replace("/*PRICE_ROWS*/", priceRows).replace("/*MEDIA_ROWS*/", mediaRows);
writeFileSync(resolve(root, "supabase/provisioning/parfums-owner-launch-merchandising.sql"), sql);
console.log(`wrote ${WANTED.length} price rows, ${media.length} media rows`);
