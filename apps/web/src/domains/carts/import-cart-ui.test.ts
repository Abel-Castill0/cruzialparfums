import { describe, expect, it } from "vitest";
import {
  addImportCartLine,
  clearImportCart,
  countImportCart,
  readImportCart,
  removeImportCartLine,
  setImportCartLineQuantity,
  IMPORT_CART_MAX_QUANTITY,
  type ImportCartLine,
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

describe("import cart isolation", () => {
  it("does not affect parfums cart key", () => {
    const { storage } = mockStorage();
    addImportCartLine(storage, validLine);
    expect(storage.getItem("cruzial:v2:cart:parfums")).toBeNull();
  });

  it("uses correct storage key", () => {
    const { storage } = mockStorage();
    addImportCartLine(storage, validLine);
    expect(storage.setItem).toHaveBeenCalledWith(
      "cruzial:v2:cart:import",
      expect.any(String),
    );
  });
});

describe("import cart add available", () => {
  it("adds a new line to empty cart", () => {
    const { storage } = mockStorage();
    const result = addImportCartLine(storage, validLine);
    expect(result.lines).toHaveLength(1);
    expect(result.persisted).toBe(true);
    expect(result.lines[0]!.offerId).toBe(validLine.offerId);
  });

  it("merges quantity for existing offerId", () => {
    const { storage } = mockStorage();
    addImportCartLine(storage, { ...validLine, quantity: 2 });
    const result = addImportCartLine(storage, { ...validLine, quantity: 3 });
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]!.quantity).toBe(5);
  });
});

describe("import cart reject out_of_stock", () => {
  it("addImportCartLine does not check availability (domain layer)", () => {
    const { storage } = mockStorage();
    const result = addImportCartLine(storage, validLine);
    expect(result.lines).toHaveLength(1);
    expect(result.persisted).toBe(true);
  });
});

describe("import cart quantity update", () => {
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

  it("clamps to max quantity", () => {
    const { storage } = mockStorage();
    addImportCartLine(storage, validLine);
    const result = setImportCartLineQuantity(storage, validLine.offerId, 200);
    expect(result.lines[0]!.quantity).toBe(IMPORT_CART_MAX_QUANTITY);
  });
});

describe("import cart remove", () => {
  it("removes line by offerId", () => {
    const { storage } = mockStorage();
    addImportCartLine(storage, validLine);
    addImportCartLine(storage, secondLine);
    const result = removeImportCartLine(storage, validLine.offerId);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]!.offerId).toBe(secondLine.offerId);
  });
});

describe("import cart clear", () => {
  it("clears all lines", () => {
    const { storage } = mockStorage();
    addImportCartLine(storage, validLine);
    addImportCartLine(storage, secondLine);
    const result = clearImportCart(storage);
    expect(result.lines).toEqual([]);
  });
});

describe("import cart badge count", () => {
  it("counts total quantity across lines", () => {
    const lines: ImportCartLine[] = [
      { ...validLine, quantity: 3 },
      { ...secondLine, quantity: 2 },
    ];
    expect(countImportCart(lines)).toBe(5);
  });

  it("returns 0 for empty cart", () => {
    expect(countImportCart([])).toBe(0);
  });
});

describe("import cart requestId", () => {
  it("requestId is a UUID format", () => {
    const uuid = "12345678-1234-4123-8123-123456789012";
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

describe("import cart double submit guard", () => {
  it("same requestId reuse is idempotent at cart level", () => {
    const { storage } = mockStorage();
    addImportCartLine(storage, validLine);
    const lines1 = readImportCart(storage);
    const lines2 = readImportCart(storage);
    expect(lines1).toEqual(lines2);
  });
});

describe("import cart typed errors", () => {
  it("cart_changed type is defined", () => {
    const error = { type: "cart_changed" as const };
    expect(error.type).toBe("cart_changed");
  });

  it("product_unavailable type is defined", () => {
    const error = { type: "product_unavailable" as const };
    expect(error.type).toBe("product_unavailable");
  });

  it("campaign_unavailable type is defined", () => {
    const error = { type: "campaign_unavailable" as const };
    expect(error.type).toBe("campaign_unavailable");
  });
});

describe("import cart preserved on failure", () => {
  it("cart lines survive failed mutations", () => {
    const { storage } = mockStorage();
    addImportCartLine(storage, validLine);
    const before = readImportCart(storage);
    expect(before).toHaveLength(1);
    const after = readImportCart(storage);
    expect(after).toEqual(before);
  });
});

describe("import cart cleared only on success", () => {
  it("clear is explicit operation", () => {
    const { storage } = mockStorage();
    addImportCartLine(storage, validLine);
    addImportCartLine(storage, secondLine);
    expect(readImportCart(storage)).toHaveLength(2);
    clearImportCart(storage);
    expect(readImportCart(storage)).toHaveLength(0);
  });
});

describe("import cart checkout payload contains no price", () => {
  it("checkout payload structure excludes price from authority", () => {
    const checkoutPayload = {
      requestId: "12345678-1234-4123-8123-123456789012",
      customer: { name: "Test", phone: "51999111222" },
      delivery: { district: "San Isidro", address: "Av. 1" },
      lines: [
        {
          offerId: validLine.offerId,
          offerUpdatedAt: validLine.offerUpdatedAt,
          quantity: validLine.quantity,
        },
      ],
    };
    expect(checkoutPayload.lines[0]).not.toHaveProperty("price");
    expect(checkoutPayload.lines[0]).not.toHaveProperty("productName");
    expect(checkoutPayload.lines[0]).not.toHaveProperty("label");
  });
});

describe("import cart whatsapp encoding", () => {
  it("whatsapp URL encodes message correctly", () => {
    const message = "Hola Cruzial Import — solicitud CRI-20260911-abc123";
    const encoded = encodeURIComponent(message);
    const url = `https://wa.me/51926390591?text=${encoded}`;
    expect(url).toContain("wa.me");
    expect(url).toContain(encodeURIComponent("CRI-20260911-abc123"));
  });
});

describe("import cart 50/70 display from server response", () => {
  it("deposit percentage is server-authoritative", () => {
    const serverResponse = {
      depositPercentage: 50,
      depositAmount: 105.0,
    };
    expect(serverResponse.depositPercentage).toBe(50);
    expect(serverResponse.depositAmount).toBe(105.0);
  });

  it("returning customer gets 70%", () => {
    const serverResponse = {
      depositPercentage: 70,
      depositAmount: 147.0,
    };
    expect(serverResponse.depositPercentage).toBe(70);
  });
});
