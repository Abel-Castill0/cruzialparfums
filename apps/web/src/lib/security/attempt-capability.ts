import "server-only";
import { cookies, headers } from "next/headers";
import {
  ATTEMPT_COOKIE_MAX_AGE_SECONDS,
  deriveAttemptRequestId,
  mintAttemptToken,
  parseAttemptToken,
  type AttemptFlow,
} from "./attempt-token";

/**
 * Server half of the anonymous attempt capability (see attempt-token.ts for
 * the security argument). Each flow has its own HttpOnly cookie, bounded to
 * the path its server action posts to, so it never rides along on unrelated
 * requests and is never visible to page script, URLs or storage.
 */
const FLOW_COOKIE: Record<AttemptFlow, { name: string; path: string }> = {
  "parfums-order": { name: "cz_attempt_parfums_order", path: "/parfums/checkout" },
  "import-order": { name: "cz_attempt_import_order", path: "/import/checkout" },
  complaint: { name: "cz_attempt_complaint", path: "/libro-de-reclamaciones" },
};

export const ATTEMPT_REQUIRED_CODE = "attempt_required" as const;
export const ATTEMPT_EXPIRED_CODE = "attempt_expired" as const;

export type ResolvedAttempt =
  | { ok: true; requestId: string }
  | { ok: false; code: typeof ATTEMPT_REQUIRED_CODE }
  | { ok: false; code: typeof ATTEMPT_EXPIRED_CODE };

async function isHttpsRequest() {
  if (process.env.VERCEL === "1") return true;
  const proto = (await headers()).get("x-forwarded-proto");
  return proto?.split(",")[0]?.trim() === "https";
}

async function writeAttemptCookie(flow: AttemptFlow, value: string) {
  const { name, path } = FLOW_COOKIE[flow];
  (await cookies()).set(name, value, {
    httpOnly: true,
    secure: await isHttpsRequest(),
    sameSite: "strict",
    path,
    maxAge: ATTEMPT_COOKIE_MAX_AGE_SECONDS,
  });
}

/**
 * Returns the server-derived request_id for this browser's current attempt.
 * Nothing here ever touches persistence; on failure the caller must stop.
 *
 *  - no cookie at all (first contact): a fresh capability is issued and
 *    `attempt_required` returned; the client retries exactly once. A browser
 *    that cannot keep the cookie fails the retry the same way and never
 *    reaches the create RPC.
 *  - an expired or malformed cookie: `attempt_expired`, and the cookie is
 *    deliberately NOT replaced. That capability may belong to a request that
 *    committed while its response was lost; silently minting a new one would
 *    let an automatic retry turn that unknown outcome into a second order or
 *    complaint. Only the explicit "new request" action (rotateAttempt) moves
 *    this browser to a new attempt. The cookie outlives the replay TTL
 *    (ATTEMPT_COOKIE_MAX_AGE_SECONDS) precisely so expiry is observable here
 *    instead of degrading into "no cookie".
 */
export async function resolveAttempt(flow: AttemptFlow, scope: string): Promise<ResolvedAttempt> {
  const parsed = parseAttemptToken((await cookies()).get(FLOW_COOKIE[flow].name)?.value);
  if (parsed.ok) return { ok: true, requestId: deriveAttemptRequestId(flow, scope, parsed) };
  if (parsed.reason !== "missing") return { ok: false, code: ATTEMPT_EXPIRED_CODE };
  await writeAttemptCookie(flow, mintAttemptToken());
  return { ok: false, code: ATTEMPT_REQUIRED_CODE };
}

/** Explicit "new purchase / new complaint": the next submit starts a fresh
 * attempt. The client calls it only after it acknowledged a success, or when
 * the customer explicitly chose to register a NEW request. */
export async function rotateAttempt(flow: AttemptFlow) {
  await writeAttemptCookie(flow, mintAttemptToken());
}
