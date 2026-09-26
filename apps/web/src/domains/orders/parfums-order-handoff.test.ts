import { afterEach, describe, expect, it } from "vitest";
import { getOrCreatePersistedRequestId, shouldClearCartAfterOrder } from "./parfums-order-handoff";

describe("Parfums checkout handoff", () => {
  it("clears the cart only after persistence succeeds", () => {
    expect(shouldClearCartAfterOrder("success")).toBe(true);
    expect(shouldClearCartAfterOrder("error")).toBe(false);
  });
});

const original = (globalThis as { sessionStorage?: Storage }).sessionStorage;

function fakeStorage(overrides: Partial<Storage> = {}): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, value); },
    removeItem: (key) => { store.delete(key); },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
    ...overrides,
  } as Storage;
}

describe("getOrCreatePersistedRequestId — degraded storage", () => {
  afterEach(() => {
    (globalThis as { sessionStorage?: Storage }).sessionStorage = original;
  });

  it("reports isDurable: true and persists when storage genuinely works", () => {
    (globalThis as { sessionStorage?: Storage }).sessionStorage = fakeStorage();
    const first = getOrCreatePersistedRequestId(() => "generated-id");
    expect(first).toEqual({ requestId: "generated-id", isDurable: true });
    // A second call reuses the persisted id rather than generating a new one.
    const second = getOrCreatePersistedRequestId(() => "different-id");
    expect(second).toEqual({ requestId: "generated-id", isDurable: true });
  });

  it("reports isDurable: false and still returns a usable id when storage is blocked", () => {
    (globalThis as { sessionStorage?: Storage }).sessionStorage = fakeStorage({
      setItem: () => { throw new DOMException("blocked"); },
    });
    const result = getOrCreatePersistedRequestId(() => "generated-id");
    expect(result).toEqual({ requestId: "generated-id", isDurable: false });
  });
});
