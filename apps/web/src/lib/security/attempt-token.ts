import { createHash, randomBytes } from "node:crypto";

/**
 * Anonymous attempt capability — the pure (framework-free) half.
 *
 * Separates three things the public mutating flows used to conflate:
 *
 *   1. idempotency identity — the `request_id` the persistence RPCs dedupe on;
 *   2. authorization        — the right to have an existing row's customer
 *                             data replayed back on a retry;
 *   3. public reference     — the order number / complaint reference shown to
 *                             the consumer.
 *
 * The capability is a 256-bit random nonce the SERVER issues into an HttpOnly
 * cookie (see attempt-capability.ts). The idempotency identity is DERIVED from
 * it with a domain-separated SHA-256 and is never accepted from the client:
 *
 *   request_id = uuidv4-shape( SHA-256("cruzial:attempt:v1" ‖ flow ‖ scope ‖ nonce ‖ issuedAt) )
 *
 * Why no server signing secret is needed (equivalent to a signed token here):
 *   - Replaying an existing row requires reproducing its request_id through
 *     the derivation, i.e. a SHA-256 preimage of a 256-bit nonce. Knowing the
 *     request_id, the order number or the entity UUID (all of which may be
 *     visible to admins, logs or the consumer) gives no path back to the nonce.
 *   - A forged or tampered token is either rejected as malformed or simply
 *     derives a DIFFERENT, fresh request_id — it can create a new attempt of
 *     the forger's own, never address someone else's.
 *   - flow and scope (business unit) are inside the hash, so a Parfums token
 *     replayed against Import (or a complaint scope) lands on an unrelated id.
 *   - issuedAt is inside the hash, so editing it to dodge expiry also changes
 *     the derived id.
 * A signature would add nothing an attacker could not already achieve by
 * minting their own random nonce, so no new Production secret is introduced.
 */

export const ATTEMPT_TOKEN_VERSION = "v1";
export const ATTEMPT_TTL_SECONDS = 24 * 60 * 60;
const CLOCK_SKEW_SECONDS = 5 * 60;
const NONCE_BYTES = 32;
const TOKEN_PATTERN = /^v1\.([A-Za-z0-9_-]{43})\.(\d{1,12})$/;

export type AttemptFlow = "parfums-order" | "import-order" | "complaint";

export type ParsedAttemptToken =
  | { ok: true; nonce: string; issuedAt: number }
  | { ok: false; reason: "missing" | "malformed" | "expired" };

export function mintAttemptToken(
  nowSeconds: number = Math.floor(Date.now() / 1000),
  random: (size: number) => Buffer = randomBytes,
): string {
  return `${ATTEMPT_TOKEN_VERSION}.${random(NONCE_BYTES).toString("base64url")}.${nowSeconds}`;
}

export function parseAttemptToken(
  value: string | undefined | null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): ParsedAttemptToken {
  if (!value) return { ok: false, reason: "missing" };
  const match = TOKEN_PATTERN.exec(value);
  if (!match) return { ok: false, reason: "malformed" };
  const [, nonce, issuedAtText] = match as unknown as [string, string, string];
  const issuedAt = Number(issuedAtText);
  if (issuedAt > nowSeconds + CLOCK_SKEW_SECONDS) return { ok: false, reason: "malformed" };
  if (nowSeconds - issuedAt > ATTEMPT_TTL_SECONDS) return { ok: false, reason: "expired" };
  return { ok: true, nonce, issuedAt };
}

/** Domain-separated, deterministic request_id for one attempt of one flow
 * and scope. Shaped as a v4 UUID so the existing request_id columns and
 * validators accept it unchanged. */
export function deriveAttemptRequestId(
  flow: AttemptFlow,
  scope: string,
  token: { nonce: string; issuedAt: number },
): string {
  const digest = createHash("sha256")
    .update(["cruzial:attempt:v1", flow, scope, token.nonce, String(token.issuedAt)].join("\u0000"))
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x40, 6);
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8);
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
