import { describe, expect, it, vi } from "vitest";
import {
  type ImportCartLine,
  addImportCartLine,
  clearImportCart,
  countImportCart,
  importCartLineKey,
  readImportCart,
  removeImportCartLine,
  setImportCartLineQuantity,
  writeImportCart,
  IMPORT_CART_MAX_LINES,
  IMPORT_CART_MAX_QUANTITY,
} from "./import-cart";

function mockStorage(): {
  store: Record<string, string>;
  storage: Pick<Storage, "getItem" | "setItem">;
} {
  const store: Record<string, string> = {};
  return {
    store,
    storage: {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
    },
  };
}

const validLine: ImportCartLine = {
  offerId: "00000000-0000-4000-8000-000000000001",
  offerUpdatedAt: "2026-09-10T12:00:00Z",
  label: "100 ml",
  productName: "Brand A Product A",
  price: "210.00",
  currency: "PEN",
  quantity: 1,
};

const secondLine: ImportCartLine = {
  offerId: "00000000-0000-4000-8000-000000000002",
  offerUpdatedAt: "2026-09-10T12:00:00Z",
  label: "50 ml",
  productName: "Brand B Product B",
  price: "310.00",
  currency: "PEN",
  quantity: 2,
};

describe("import cart line normalization", () => {
  it("deduplicates by offerId and sums quantities", () => {
    const { storage } = mockStorage();
    addImportCartLine(storage, { ...validLine, quantity: 2 });
    const result2 = addImportCartLine(storage, { ...validLine, quantity: 3 });
    expect(result2.lines).toHaveLength(1);
    expect(result2.lines[0]!.quantity).toBe(5);
  });

  it("clamps quantity to 99", () => {
    const { storage } = mockStorage();
    addImportCartLine(storage, { ...validLine, quantity: 50 });
    const result = addImportCartLine(storage, { ...validLine, quantity: 60 });
    expect(result.lines[0]!.quantity).toBe(IMPORT_CART_MAX_QUANTITY);
  });

  it("clamps incoming quantity to 1-99", () => {
    const { storage } = mockStorage();
    const result = addImportCartLine(storage, { ...validLine, quantity: 0 });
    expect(result.lines[0]!.quantity).toBe(1);
  });

  it("rejects new lines beyond max lines", () => {
    const { storage } = mockStorage();
    for (let i = 0; i < IMPORT_CART_MAX_LINES; i++) {
      addImportCartLine(storage, {
        ...validLine,
        offerId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        quantity: 1,
      });
    }
    const overflow = addImportCartLine(storage, {
      ...secondLine,
      offerId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      quantity: 1,
    });
    expect(overflow.persisted).toBe(false);
    expect(overflow.lines).toHaveLength(IMPORT_CART_MAX_LINES);
  });

  it("allows updating existing lines even at max", () => {
    const { storage } = mockStorage();
    for (let i = 0; i < IMPORT_CART_MAX_LINES; i++) {
      addImportCartLine(storage, {
        ...validLine,
        offerId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        quantity: 1,
      });
    }
    const result = addImportCartLine(storage, {
      ...validLine,
      offerId: "00000000-0000-4000-8000-000000000000",
      quantity: 1,
    });
    expect(result.lines).toHaveLength(IMPORT_CART_MAX_LINES);
    expect(result.lines[0]!.quantity).toBe(2);
  });
});

describe("import cart read/write", () => {
  it("reads empty cart from empty storage", () => {
    const { storage } = mockStorage();
    expect(readImportCart(storage)).toEqual([]);
  });

  it("persists and reads back", () => {
    const { storage } = mockStorage();
    const result = addImportCartLine(storage, validLine);
    expect(readImportCart(storage)).toEqual(result.lines);
  });

  it("returns persisted: false on storage error", () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error("quota exceeded");
      }),
    };
    const result = writeImportCart(storage, [validLine]);
    expect(result.persisted).toBe(false);
    expect(result.lines).toHaveLength(1);
  });

  it("clears the cart", () => {
    const { storage } = mockStorage();
    addImportCartLine(storage, validLine);
    const result = clearImportCart(storage);
    expect(result.lines).toEqual([]);
  });
});

describe("import cart mutations", () => {
  it("updates quantity by offerId", () => {
    const { storage } = mockStorage();
    addImportCartLine(storage, validLine);
    const result = setImportCartLineQuantity(storage, validLine.offerId, 5);
    expect(result.lines[0]!.quantity).toBe(5);
  });

  it("removes line when quantity drops to 0", () => {
    const { storage } = mockStorage();
    addImportCartLine(storage, validLine);
    const result = setImportCartLineQuantity(storage, validLine.offerId, 0);
    expect(result.lines).toHaveLength(0);
  });

  it("removes line by offerId", () => {
    const { storage } = mockStorage();
    addImportCartLine(storage, validLine);
    addImportCartLine(storage, secondLine);
    const result = removeImportCartLine(storage, validLine.offerId);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]!.offerId).toBe(secondLine.offerId);
  });
});

describe("import cart helpers", () => {
  it("counts total quantity across lines", () => {
    const lines: ImportCartLine[] = [
      { ...validLine, quantity: 3 },
      { ...secondLine, quantity: 2 },
    ];
    expect(countImportCart(lines)).toBe(5);
  });

  it("line key is offerId", () => {
    expect(importCartLineKey(validLine)).toBe(validLine.offerId);
  });
});
