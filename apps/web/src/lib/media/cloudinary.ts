import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
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
 * signature, the already-decided public_id) or performs the server-to-
 * Cloudinary call itself (destroy).
 *
 * Trust boundary (security-critical): the browser reports back whatever the
 * Cloudinary upload response said (`publicId`, `secureUrl`, `format`,
 * `bytes`) and that report is never assumed truthful. The server never lets
 * a client-supplied public_id decide what gets destroyed — see
 * `resolveAuthorizedUpload`.
 *
 * `authorizationToken` (see `signAuthorizationToken`/`resolveAuthorizedUpload`)
 * is tamper-evident (HMAC-signed) and short-lived (`AUTHORIZATION_TTL_SECONDS`),
 * and it is bound to one product/unit/public_id. It is NOT single-use: it
 * stays valid and resolvable for its full TTL, so a caller can present the
 * same token more than once (e.g. after an upload already registered, or on
 * a retried request). That makes it suitable for provenance validation
 * ("this is the public_id we minted for this product") but NOT, by itself,
 * sufficient authority for a destructive Cloudinary operation — proving
 * provenance is not the same as proving the asset is still an orphan. No
 * caller in this codebase destroys a Cloudinary asset off the back of a
 * validation failure; see the callers of `resolveAuthorizedUpload` in
 * `apps/web/src/app/admin/*\/productos/[id]/media-actions.ts` for the actual
 * policy (invalid token/upload → error, no delete).
 */

const ALLOWED_FORMATS = ["jpg", "jpeg", "png", "webp"] as const;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB — generous for a product photo, not unbounded.
const AUTHORIZATION_TTL_SECONDS = 15 * 60; // upload widget round-trip window

export { ALLOWED_FORMATS, MAX_UPLOAD_BYTES };

type UnitCode = "parfums" | "import";

function unitFolder(unitCode: UnitCode, productId: string): string {
  return `cruzial/${unitCode}/products/${productId}`;
}

function signParams(params: Record<string, string | number>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(`${toSign}${apiSecret}`).digest("hex");
}

type UploadTokenPayload = {
  publicId: string;
  productId: string;
  unitCode: UnitCode;
  expiresAt: number; // epoch seconds
};

/**
 * Self-contained, tamper-evident authorization token: `base64url(json).hmac`.
 * Encodes exactly which public_id/product/unit this authorization is for, so
 * `resolveAuthorizedUpload` can recover the *server-minted* public_id later
 * without any shared state between the two Server Action calls — and without
 * ever trusting whatever public_id the browser claims in step 2.
 */
function signAuthorizationToken(payload: UploadTokenPayload, apiSecret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const mac = createHmac("sha256", apiSecret).update(encoded).digest("base64url");
  return `${encoded}.${mac}`;
}

function verifyAuthorizationToken(token: string, apiSecret: string): UploadTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, mac] = parts;
  if (!encoded || !mac) return null;

  const expectedMac = createHmac("sha256", apiSecret).update(encoded).digest("base64url");
  const macBuffer = Buffer.from(mac);
  const expectedBuffer = Buffer.from(expectedMac);
  if (macBuffer.length !== expectedBuffer.length || !timingSafeEqual(macBuffer, expectedBuffer)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as UploadTokenPayload).publicId !== "string" ||
    typeof (payload as UploadTokenPayload).productId !== "string" ||
    typeof (payload as UploadTokenPayload).unitCode !== "string" ||
    typeof (payload as UploadTokenPayload).expiresAt !== "number"
  ) {
    return null;
  }

  const typed = payload as UploadTokenPayload;
  if (typed.expiresAt < Math.floor(Date.now() / 1000)) return null;
  return typed;
}

export type UploadAuthorization = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
  allowedFormats: string;
  maxBytes: number;
  /** Opaque; pass unchanged to the matching register action. */
  authorizationToken: string;
};

/**
 * Builds a short-lived signed upload authorization for one specific,
 * server-minted `public_id` scoped to the product's isolated folder
 * (`cruzial/parfums/products/<product-id>/<random>`). `public_id` and
 * `allowed_formats` are both part of the signed param set, so a browser that
 * tries to upload under a different public_id or a disallowed format
 * invalidates the signature — Cloudinary itself rejects the request, this is
 * not a client-side-only restriction.
 *
 * The returned `authorizationToken` binds this exact public_id to this
 * product/unit with an expiry; `resolveAuthorizedUpload` verifies it later so
 * the register step never has to trust a client-reported public_id.
 */
export function createUploadAuthorization(productId: string, unitCode: UnitCode = "parfums"): UploadAuthorization | null {
  assertServerOnly("createUploadAuthorization");
  const env = readCloudinaryEnv();
  if (!env) return null;

  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `${unitFolder(unitCode, productId)}/${randomUUID()}`;
  const allowedFormats = ALLOWED_FORMATS.join(",");

  const signature = signParams({ allowed_formats: allowedFormats, public_id: publicId, timestamp }, env.apiSecret);
  const authorizationToken = signAuthorizationToken(
    { publicId, productId, unitCode, expiresAt: timestamp + AUTHORIZATION_TTL_SECONDS },
    env.apiSecret,
  );

  return {
    cloudName: env.cloudName,
    apiKey: env.apiKey,
    timestamp,
    signature,
    publicId,
    allowedFormats,
    maxBytes: MAX_UPLOAD_BYTES,
    authorizationToken,
  };
}

/**
 * Recovers the public_id this server actually authorized for `productId`/
 * `unitCode`, by verifying `authorizationToken`'s signature and expiry. A
 * forged or expired token, or one minted for a different product/unit,
 * returns null. This is the only source of truth for "what public_id did we
 * mean" — callers must never substitute a client-reported public_id here.
 */
export function resolveAuthorizedUpload(
  authorizationToken: string,
  productId: string,
  unitCode: UnitCode = "parfums",
): string | null {
  assertServerOnly("resolveAuthorizedUpload");
  const env = readCloudinaryEnv();
  if (!env) return null;

  const payload = verifyAuthorizationToken(authorizationToken, env.apiSecret);
  if (!payload) return null;
  if (payload.productId !== productId || payload.unitCode !== unitCode) return null;
  return payload.publicId;
}

/**
 * Destroys a Cloudinary asset by public_id. Never throws — a cleanup failure
 * must not mask a caller's own error, so this returns a boolean and lets the
 * caller decide how to report it (never as a silent success either way).
 *
 * SECURITY: this function has no callers in this codebase today. The upload
 * flow deliberately does NOT call this on an invalid/replayed
 * authorizationToken or a rejected uploadResult — see the module-level trust
 * boundary note above for why `authorizationToken` provenance is not proof
 * of orphan status. It is kept as a primitive for a future, explicitly
 * single-use/ledgered orphan-reconciliation mechanism. Do not wire it back
 * into a validation-failure path without that safeguard: doing so
 * reintroduces a token-replay bug where a legitimate, already-registered
 * asset can be destroyed by replaying a still-valid token with a
 * mismatched/invalid upload result. If you do add a caller, it must only
 * ever pass a `publicId` proven via a single-use consumption record — never
 * a bare client-reported string, and never a token resolution alone.
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Validates that a Cloudinary-reported `secure_url` actually points at the
 * exact asset this server authorized — not merely "looks like an https URL".
 * Checks protocol, host, cloud name, resource type, and that the path is
 * exactly `<public_id>.<format>` (an optional Cloudinary `v<digits>/` version
 * segment is tolerated; no transformation segments are, since this app never
 * requests transformed delivery URLs on upload).
 */
function isSecureUrlValid(secureUrl: string, cloudName: string, expectedPublicId: string, format: string): boolean {
  let url: URL;
  try {
    url = new URL(secureUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.host !== "res.cloudinary.com") return false;

  const pattern = new RegExp(
    `^/${escapeRegExp(cloudName)}/image/upload/(?:v\\d+/)?${escapeRegExp(expectedPublicId)}\\.${escapeRegExp(format.toLowerCase())}$`,
  );
  return pattern.test(url.pathname);
}

/**
 * Validates a Cloudinary upload *response* against the exact public_id this
 * server authorized (`expectedPublicId`, from `resolveAuthorizedUpload`) —
 * never against the client-reported public_id alone. Never trust this
 * response beyond what's checked here.
 */
export function isUploadResultValid(input: {
  publicId: string;
  secureUrl: string;
  format: string;
  bytes: number;
  expectedPublicId: string;
  cloudName: string;
}): boolean {
  if (input.publicId !== input.expectedPublicId) return false;
  if (!(ALLOWED_FORMATS as readonly string[]).includes(input.format.toLowerCase())) return false;
  if (!Number.isFinite(input.bytes) || input.bytes <= 0 || input.bytes > MAX_UPLOAD_BYTES) return false;
  if (!isSecureUrlValid(input.secureUrl, input.cloudName, input.expectedPublicId, input.format)) return false;
  return true;
}
