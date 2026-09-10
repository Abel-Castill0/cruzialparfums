import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { reconcileConsolidado } from "./lib/import-consolidado-reconciliation.mjs";

const inputPath = new URL("../supabase/staging/import/sexto-consolidado-staging.json", import.meta.url);
const outputPath = new URL("../supabase/staging/import/sexto-consolidado-reviewed.json", import.meta.url);
const raw = await readFile(inputPath, "utf8");
const staging = JSON.parse(raw);
const reviewed = reconcileConsolidado(staging);
const serialized = `${JSON.stringify(reviewed, null, 2)}\n`;
await writeFile(outputPath, serialized, "utf8");
console.log(JSON.stringify({ ...reviewed.counts, output_sha256: createHash("sha256").update(serialized).digest("hex") }, null, 2));
