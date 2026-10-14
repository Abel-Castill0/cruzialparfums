import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
const require = createRequire("file:///C:/dev/cruzialparfums/apps/web/package.json");
const { rolldown } = require("rolldown");
const entries = {
  "parse.ts alone (no Zod)": "src/lib/rich-text/parse.ts",
  "schema.ts (Zod full + parse)": "src/lib/rich-text/schema.ts",
};
mkdirSync(process.argv[2], { recursive: true });
writeFileSync(process.argv[2] + "/zod-mini-probe.mjs", 'import * as z from "zod/mini"; export const s = z.object({ title: z.string().check(z.maxLength(80)), body: z.string().check(z.maxLength(2000)) });');
entries["Zod mini (same two fields)"] = "zz-zod-mini-probe.mjs";
const out = {};
for (const [name, input] of Object.entries(entries)) {
  const bundle = await rolldown({ input, platform: "browser", external: [] });
  const { output } = await bundle.generate({ minify: true, format: "esm" });
  const code = output[0].code;
  out[name] = { minKB: +(Buffer.byteLength(code) / 1024).toFixed(1), gzipKB: +(gzipSync(code).length / 1024).toFixed(1) };
}
console.log(JSON.stringify(out, null, 1));
