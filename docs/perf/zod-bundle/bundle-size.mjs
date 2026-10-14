import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
const root = process.argv[2] ?? ".next";
const out = process.argv[3];
function walk(dir) { return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; }); }
const files = walk(join(root, "static")).filter((f) => f.endsWith(".js"));
let raw = 0, gz = 0;
for (const f of files) { const b = readFileSync(f); raw += b.length; gz += gzipSync(b).length; }
const stats = JSON.parse(readFileSync(join(root, "diagnostics/route-bundle-stats.json"), "utf8"));
const routes = Object.fromEntries(stats.map((r) => [r.route, r.firstLoadUncompressedJsBytes]));
const result = { files: files.length, clientJsRawBytes: raw, clientJsGzipBytes: gz, routes };
if (out) writeFileSync(out, JSON.stringify(result, null, 1));
console.log(files.length, "files", (raw / 1024).toFixed(1), "KB raw", (gz / 1024).toFixed(1), "KB gzip;", Object.keys(routes).length, "routes");
