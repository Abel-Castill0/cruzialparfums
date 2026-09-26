export const PARFUMS_ORDER_HANDOFF_PREFIX = "cruzial:parfums-order-handoff:";

export function handoffStorageKey(orderNumber: string) {
  return `${PARFUMS_ORDER_HANDOFF_PREFIX}${orderNumber}`;
}

export function shouldClearCartAfterOrder(status: "success" | "error") {
  return status === "success";
}

import { isSessionStorageAvailable } from "@/lib/browser-storage";

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

export type PendingRequestIdResult = {
  requestId: string;
  /** false when sessionStorage cannot actually persist this id — a reload
   * after a lost response can then no longer recover it, so a retry would
   * generate a new id and the server-side idempotency check (keyed on that
   * id) cannot recognize it as the same attempt. Duplicate prevention
   * within a single unreloaded tab session still works regardless (the id
   * stays stable in memory for the life of that page), so this is not
   * blocking — the caller is expected to warn the customer rather than
   * silently claim a guarantee that cannot be kept over a reload. */
  isDurable: boolean;
};

/** Persists the pending-attempt id immediately (not just on submit) so a
 * lost server response followed by a page reload recovers the SAME id,
 * letting a retry land as an idempotent replay instead of a second order.
 * Only ever rotated by clearStoredRequestId — a resolved success, or the
 * user explicitly starting a new purchase — never by editing a field or
 * cart line before the first submit. */
export function getOrCreatePersistedRequestId(
  generateId: () => string = () => crypto.randomUUID(),
): PendingRequestIdResult {
  if (!isSessionStorageAvailable()) return { requestId: generateId(), isDurable: false };
  const existing = readStoredRequestId();
  if (existing) return { requestId: existing, isDurable: true };
  const fresh = generateId();
  writeStoredRequestId(fresh);
  return { requestId: fresh, isDurable: true };
}
