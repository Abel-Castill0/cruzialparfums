export const ATTEMPT_REQUIRED = "attempt_required";

/**
 * Client side of the attempt-capability handshake. A browser with no usable
 * attempt cookie gets `attempt_required` (nothing was persisted) together
 * with a freshly issued HttpOnly cookie, so exactly ONE automatic retry is
 * made. If the browser could not keep that cookie, the retry fails the same
 * way and its fail-closed message is shown — the action is never repeated in
 * a loop and never proceeds without the capability.
 */
export async function submitWithAttemptCapability<T extends { status: string; code?: string }>(
  call: () => Promise<T>,
): Promise<T> {
  const first = await call();
  if (first.status === "error" && first.code === ATTEMPT_REQUIRED) return call();
  return first;
}

const ROTATION_PENDING_PREFIX = "cruzial:attempt-rotation-pending:";

/**
 * Called once a success has actually been received: the next submission
 * must start a new attempt. If the rotation call itself fails, a marker is
 * left (storage used only as a UX hint, never for correctness) so the next
 * visit retries the rotation before the customer submits again.
 */
export async function rotateAttemptAfterSuccess(flow: string, rotate: () => Promise<void>) {
  try {
    await rotate();
    try { localStorage.removeItem(ROTATION_PENDING_PREFIX + flow); } catch { /* noop */ }
  } catch {
    try { localStorage.setItem(ROTATION_PENDING_PREFIX + flow, "1"); } catch { /* noop */ }
  }
}

/** Effect-only (never during render, so hydration stays deterministic). */
export function recoverPendingAttemptRotation(flow: string, rotate: () => Promise<void>) {
  let pending = false;
  try { pending = localStorage.getItem(ROTATION_PENDING_PREFIX + flow) === "1"; } catch { /* noop */ }
  if (pending) void rotateAttemptAfterSuccess(flow, rotate);
}
