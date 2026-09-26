import { afterEach, describe, expect, it } from "vitest";
import { isSessionStorageAvailable } from "./browser-storage";

const original = (globalThis as { sessionStorage?: Storage }).sessionStorage;

afterEach(() => {
  (globalThis as { sessionStorage?: Storage }).sessionStorage = original;
});

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

describe("isSessionStorageAvailable", () => {
  it("is true when sessionStorage genuinely writes and reads back", () => {
    (globalThis as { sessionStorage?: Storage }).sessionStorage = fakeStorage();
    expect(isSessionStorageAvailable()).toBe(true);
  });

  it("is false when sessionStorage does not exist at all (e.g. this node test environment)", () => {
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
    expect(isSessionStorageAvailable()).toBe(false);
  });

  it("is false when setItem throws (blocked storage, some privacy modes)", () => {
    (globalThis as { sessionStorage?: Storage }).sessionStorage = fakeStorage({
      setItem: () => { throw new DOMException("blocked", "SecurityError"); },
    });
    expect(isSessionStorageAvailable()).toBe(false);
  });

  it("is false when the API exists but silently no-ops instead of throwing (read-back check catches this)", () => {
    (globalThis as { sessionStorage?: Storage }).sessionStorage = fakeStorage({
      setItem: () => {},
      getItem: () => null,
    });
    expect(isSessionStorageAvailable()).toBe(false);
  });
});
