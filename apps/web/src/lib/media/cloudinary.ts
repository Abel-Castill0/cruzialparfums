import { createHash } from "node:crypto";
import { readCloudinaryEnv } from "./cloudinary-env";

/** Same guard style as cloudinary-env.ts/src/lib/supabase/env.ts (a runtime
 * `typeof window` check, not the `server-only` package) — house convention
 * in this codebase, and it keeps this module importable from a plain vitest
 * unit test without a bundler-provided stub. */
function assertServerOnly(fnName: string) {
  if (typeof window !== "undefined") {
    throw new Error(`${fnName}() must never run in the browser.`);
  }
}

/**
 * Server-side Cloudinary signing.
 *
 * No Cloudinary SDK dependency: a signed-upload signature is just
 * `sha1(sorted "key=value&..." of every non-file param + api_secret)` per
 * Cloudinary's own documented algorithm, and destroy uses the same scheme
 * over a smaller param set. Hand-rolling this with node:crypto keeps the
 * secret in exactly one small, auditable file instead of pulling in a
 * general-purpose SDK for two API calls.
 *
 * The API secret never leaves this module — every function here returns
 * only what the browser is allowed to see (cloud name, api key, timestamp,
 * signature, the already-decided folder) or performs the server-to-
 * Cloudinary call itself (destroy).
 */

const ALLOWED_FORMATS = ["jpg", "jpeg", "png", "webp"] as const;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB — generous for a product photo, not unbounded.

export { ALLOWED_FORMATS, MAX_UPLOAD_BYTES };

type UnitCode = "parfums" | "import";

function unitFolder(unitCode: UnitCode, productId: string): string {
  return `cruzial/${unitCode}/products/${productId}`;
}

function unitPrefix(unitCode: UnitCode, productId: string): string {
  return `${unitFolder(unitCode, productId)}/`;
}

function signParams(params: Record<string, string | number>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(`${toSign}${apiSecret}`).digest("hex");
}

export type UploadAuthorization = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  allowedFormats: string;
  maxBytes: number;
};

/**
 * Builds a short-lived signed upload authorization scoped to one product's
 * isolated folder (`cruzial/parfums/products/<product-id>/`). `folder` and
 * `allowed_formats` are both part of the signed param set, so a browser that
 * tries to upload to a different folder or a disallowed format invalidates
 * the signature — Cloudinary itself rejects the request, this is not a
 * client-side-only restriction.
 */
export function createUploadAuthorization(productId: string, unitCode: UnitCode = "parfums"): UploadAuthorization | null {
  assertServerOnly("createUploadAuthorization");
  const env = readCloudinaryEnv();
  if (!env) return null;

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = unitFolder(unitCode, productId);
  const allowedFormats = ALLOWED_FORMATS.join(",");

  const signature = signParams({ allowed_formats: allowedFormats, folder, timestamp }, env.apiSecret);

  return {
    cloudName: env.cloudName,
    apiKey: env.apiKey,
    timestamp,
    signature,
    folder,
    allowedFormats,
    maxBytes: MAX_UPLOAD_BYTES,
  };
}

/**
 * Best-effort cleanup for an orphan risk: a Cloudinary upload that succeeded
 * but whose result this app then rejected (bad metadata) or failed to
 * persist. Never throws — a cleanup failure must not mask the original
 * error, so callers get a boolean and decide how to report it (never as a
 * silent success either way).
 */
export async function destroyAsset(publicId: string): Promise<{ ok: boolean }> {
  assertServerOnly("destroyAsset");
  const env = readCloudinaryEnv();
  if (!env) return { ok: false };

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signParams({ public_id: publicId, timestamp }, env.apiSecret);

  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${env.cloudName}/image/destroy`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        public_id: publicId,
        api_key: env.apiKey,
        timestamp: String(timestamp),
        signature,
      }),
    });
    if (!response.ok) return { ok: false };
    const data = (await response.json()) as { result?: string };
    return { ok: data.result === "ok" || data.result === "not found" };
  } catch {
    return { ok: false };
  }
}

/** Validates a Cloudinary upload *response* — never trust it beyond this. */
export function isUploadResultValid(input: {
  publicId: string;
  format: string;
  bytes: number;
  productId: string;
  unitCode?: UnitCode;
}): boolean {
  const expectedPrefix = unitPrefix(input.unitCode ?? "parfums", input.productId);
  if (!input.publicId.startsWith(expectedPrefix)) return false;
  if (!(ALLOWED_FORMATS as readonly string[]).includes(input.format.toLowerCase())) return false;
  if (!Number.isFinite(input.bytes) || input.bytes <= 0 || input.bytes > MAX_UPLOAD_BYTES) return false;
  return true;
}
