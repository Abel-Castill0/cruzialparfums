export const ATTEMPT_REQUIRED = "attempt_required";
export const ATTEMPT_EXPIRED = "attempt_expired";

/**
 * Client side of the attempt-capability handshake. A browser with no attempt
 * cookie at all gets `attempt_required` (nothing was persisted) together with
 * a freshly issued HttpOnly cookie, so exactly ONE automatic retry is made. If
 * the browser could not keep that cookie, the retry fails the same way and its
 * fail-closed message is shown — the action is never repeated in a loop and
 * never proceeds without the capability.
 *
 * `attempt_expired` is never retried automatically: the previous capability
 * may belong to a request that committed while its response was lost, so only
 * an explicit "register as a new request" action (startNewAttempt) may lead to
 * another mutation.
 */
export async function submitWithAttemptCapability<T extends { status: string; code?: string }>(
  call: () => Promise<T>,
): Promise<T> {
  const first = await call();
  if (first.status === "error" && first.code === ATTEMPT_REQUIRED) return call();
  return first;
}

/**
 * Moves this browser to a fresh attempt. Resolves true only when the server
 * confirmed the rotation. Correctness never depends on it succeeding: while
 * the old capability remains, the server replays the already-registered
 * request (reported as `created: false`, which the UI presents as "already
 * registered, nothing new was created") — it can never produce a duplicate
 * or pass an old request off as a new one. No browser storage is involved.
 */
export async function startNewAttempt(rotate: () => Promise<void>): Promise<boolean> {
  try {
    await rotate();
    return true;
  } catch {
    return false;
  }
}
