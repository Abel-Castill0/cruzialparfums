import { describe, expect, it } from "vitest";
import { CART_STORAGE_KEYS } from "../platform/contracts";
import {
  addParfumsCartLine,
  clearParfumsCart,
  countParfumsCart,
  readParfumsCart,
  removeParfumsCartLine,
  setParfumsCartLineQuantity,
} from "./parfums-cart";

describe("Parfums cart persistence boundary", () => {
  it("reads only the Parfums key and ignores malformed lines", () => {
    const values = new Map<string, string>([
      [
        CART_STORAGE_KEYS.parfums,
        JSON.stringify([
          { productId: "khamrah-clasico", variantId: "decant-3ml", quantity: 2 },
          { productId: "broken", quantity: -1 },
        ]),
      ],
      [
        CART_STORAGE_KEYS.import,
        JSON.stringify([{ productId: "watch", variantId: "default", quantity: 99 }]),
      ],
    ]);
    const storage = { getItem: (key: string) => values.get(key) ?? null };

    const lines = readParfumsCart(storage);
    expect(lines).toEqual([
      { productId: "khamrah-clasico", variantId: "decant-3ml", quantity: 2 },
    ]);
    expect(countParfumsCart(lines)).toBe(2);
  });

  it("fails closed on corrupt persisted JSON", () => {
    expect(readParfumsCart({ getItem: () => "not json" })).toEqual([]);
  });

  it("adds only to the Parfums store", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    const first = addParfumsCartLine(storage, {
      productId: "khamrah-clasico",
      variantId: "decant-3ml",
      quantity: 1,
    });
    addParfumsCartLine(storage, {
      productId: "khamrah-clasico",
      variantId: "decant-3ml",
      quantity: 1,
    });

    expect(values.has(CART_STORAGE_KEYS.import)).toBe(false);
    expect(first.persisted).toBe(true);
    expect(countParfumsCart(readParfumsCart(storage))).toBe(2);
  });

  it("normalizes duplicate lines and bounds quantities", () => {
    const storage = {
      getItem: () => JSON.stringify([
        { productId: "p1", variantId: "decant-3ml", quantity: 70 },
        { productId: "p1", variantId: "decant-3ml", quantity: 70 },
        { productId: "p2", variantId: "decant-5ml", quantity: 120 },
      ]),
    };

    expect(readParfumsCart(storage)).toEqual([
      { productId: "p1", variantId: "decant-3ml", quantity: 99 },
      { productId: "p2", variantId: "decant-5ml", quantity: 99 },
    ]);
  });

  it("updates, removes and clears without touching the Import key", () => {
    const values = new Map<string, string>([
      [CART_STORAGE_KEYS.parfums, JSON.stringify([
        { productId: "p1", variantId: "decant-3ml", quantity: 2 },
        { productId: "p2", variantId: "bottle-100ml", quantity: 1 },
      ])],
      [CART_STORAGE_KEYS.import, "keep-me"],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    setParfumsCartLineQuantity(storage, "p1", "decant-3ml", 3);
    removeParfumsCartLine(storage, "p2", "bottle-100ml");
    expect(readParfumsCart(storage)).toEqual([
      { productId: "p1", variantId: "decant-3ml", quantity: 3 },
    ]);
    clearParfumsCart(storage);
    expect(readParfumsCart(storage)).toEqual([]);
    expect(values.get(CART_STORAGE_KEYS.import)).toBe("keep-me");
  });

  it("reports persistence failures without throwing", () => {
    const storage = {
      getItem: () => "[]",
      setItem: () => { throw new Error("quota"); },
    };
    expect(addParfumsCartLine(storage, {
      productId: "p1",
      variantId: "decant-3ml",
      quantity: 1,
    })).toEqual({
      lines: [{ productId: "p1", variantId: "decant-3ml", quantity: 1 }],
      persisted: false,
    });
  });
});
