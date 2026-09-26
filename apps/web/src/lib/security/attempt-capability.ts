import "server-only";
import { cookies, headers } from "next/headers";
import {
  ATTEMPT_TTL_SECONDS,
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

export type ResolvedAttempt =
  | { ok: true; requestId: string }
  | { ok: false; code: typeof ATTEMPT_REQUIRED_CODE; reason: "missing" | "malformed" | "expired" };

async function isHttpsRequest() {
  if (process.env.VERCEL === "1") return true;
  const proto = (await headers()).get("x-forwarded-proto");
  return proto?.split(",")[0]?.trim() === "https";
}

async function writeAttemptCookie(flow: AttemptFlow, value: string, maxAge: number) {
  const { name, path } = FLOW_COOKIE[flow];
  (await cookies()).set(name, value, {
    httpOnly: true,
    secure: await isHttpsRequest(),
    sameSite: "strict",
    path,
    maxAge,
  });
}

/**
 * Returns the server-derived request_id for this browser's current attempt.
 * With no usable capability it issues a fresh one and returns
 * `attempt_required` WITHOUT touching persistence: the caller must stop, and
 * the client may retry exactly once. A browser that cannot keep the cookie
 * therefore never reaches the create RPC — it fails closed instead of
 * creating orders in a mode where a lost response cannot be replayed.
 */
export async function resolveAttempt(flow: AttemptFlow, scope: string): Promise<ResolvedAttempt> {
  const parsed = parseAttemptToken((await cookies()).get(FLOW_COOKIE[flow].name)?.value);
  if (parsed.ok) return { ok: true, requestId: deriveAttemptRequestId(flow, scope, parsed) };
  await writeAttemptCookie(flow, mintAttemptToken(), ATTEMPT_TTL_SECONDS);
  return { ok: false, code: ATTEMPT_REQUIRED_CODE, reason: parsed.reason };
}

/** Explicit "new purchase / new complaint": the next submit starts a fresh
 * attempt. Called only after the client has received a resolved success, so
 * a lost response keeps the old capability and replays instead. */
export async function rotateAttempt(flow: AttemptFlow) {
  await writeAttemptCookie(flow, mintAttemptToken(), ATTEMPT_TTL_SECONDS);
}
