import { describe, expect, it } from "vitest";
import { CART_STORAGE_KEYS } from "../platform/contracts";
import { countParfumsCart, readParfumsCart } from "./parfums-cart";

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
});
