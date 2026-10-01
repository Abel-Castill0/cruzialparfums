/**
 * One-off operator tool (owner-delegated launch merchandising, 2026-10-01):
 * uploads the two real client photos for `liquid-brun` to Cloudinary using the
 * same signed-upload convention as scripts/migrate-client-media.mjs
 * (public_id cruzial/parfums/catalog/<slug>/<role>, overwrite=false), and prints
 * the resulting asset metadata as JSON for supabase/provisioning/
 * parfums-owner-launch-merchandising.sql. Originals under img/perfumes are only
 * read, never modified. Secrets are read from an env file and never printed.
 *
 *   node scripts/upload-owner-launch-photo.mjs <path-to-apps/web/.env.local> <repo-with-img/perfumes>
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [envPath, imgRoot] = process.argv.slice(2);
if (!envPath || !imgRoot) throw new Error("usage: <env-file> <repo-root-with-img>");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = env;
if (!cloud || !key || !secret) throw new Error("Cloudinary env not configured");

// Role convention (see existing rows): `set` = bottle + decant vials, primary, sort 0; `bottle` = bottle only, sort 1.
const files = [
  { role: "set", file: "FRENCH AVENEU -LIQUID BRUN.png" },
  { role: "bottle", file: "FRENCH AVENEU - LIQUID BRUN.png" },
];

const sign = (p) => createHash("sha1").update(Object.keys(p).sort().map((k) => `${k}=${p[k]}`).join("&") + secret).digest("hex");
const out = [];
for (const { role, file } of files) {
  const path = join(imgRoot, "img/perfumes", file);
  const bytes = readFileSync(path);
  const publicId = `cruzial/parfums/catalog/liquid-brun/${role}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { context: `legacy_id=liquid-brun|media_role=${role}`, invalidate: "false", overwrite: "false", public_id: publicId, timestamp, unique_filename: "false", use_filename: "false" };
  const form = new FormData();
  form.append("file", new Blob([bytes]), `${role}.png`);
  form.append("api_key", key);
  form.append("timestamp", String(timestamp));
  form.append("signature", sign(params));
  for (const [k, v] of Object.entries(params)) if (k !== "timestamp") form.append(k, String(v));
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(`upload ${publicId} failed: ${JSON.stringify(data.error ?? data)}`);
  out.push({
    role, publicId: data.public_id, secureUrl: data.secure_url, width: data.width, height: data.height,
    bytes: data.bytes, format: data.format, sha256: createHash("sha256").update(bytes).digest("hex"), sourceFile: file,
  });
}
console.log(JSON.stringify(out, null, 2));
