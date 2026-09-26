export const PARFUMS_ORDER_HANDOFF_PREFIX = "cruzial:parfums-order-handoff:";

export function handoffStorageKey(orderNumber: string) {
  return `${PARFUMS_ORDER_HANDOFF_PREFIX}${orderNumber}`;
}

export function shouldClearCartAfterOrder(status: "success" | "error") {
  return status === "success";
}

export const PARFUMS_PENDING_REQUEST_ID_KEY = "cruzial:parfums:checkout:request-id";

function readStoredRequestId(): string | null {
  try {
    return sessionStorage.getItem(PARFUMS_PENDING_REQUEST_ID_KEY);
  } catch {
    return null;
  }
}

function writeStoredRequestId(requestId: string) {
  try {
    sessionStorage.setItem(PARFUMS_PENDING_REQUEST_ID_KEY, requestId);
  } catch {
    /* best-effort: durability degrades to in-memory only for this tab */
  }
}

export function clearStoredRequestId() {
  try {
    sessionStorage.removeItem(PARFUMS_PENDING_REQUEST_ID_KEY);
  } catch {
    /* noop */
  }
}

/** Persists the pending-attempt id immediately (not just on submit) so a
 * lost server response followed by a page reload recovers the SAME id,
 * letting a retry land as an idempotent replay instead of a second order.
 * Only ever rotated by clearStoredRequestId — a resolved success, or the
 * user explicitly starting a new purchase — never by editing a field or
 * cart line before the first submit. */
export function getOrCreatePersistedRequestId(generateId: () => string = () => crypto.randomUUID()): string {
  const existing = readStoredRequestId();
  if (existing) return existing;
  const fresh = generateId();
  writeStoredRequestId(fresh);
  return fresh;
}
