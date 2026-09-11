import { describe, expect, it } from "vitest";
import {
  validateAndResolveImportOrder,
  IMPORT_ORDER_MAX_LINES,
  IMPORT_ORDER_MAX_QUANTITY,
} from "./import-order-request";

const VALID_REQUEST = {
  requestId: "00000000-0000-4000-8000-000000000001",
  customer: {
    name: "Test Client",
    phone: "+51999111222",
    district: "San Isidro",
    address: "Av. Principal 123",
    note: "Test order",
  },
  lines: [
    {
      offerId: "10000000-0000-4000-8000-000000000001",
      offerUpdatedAt: "2026-09-10T12:00:00Z",
      quantity: 2,
    },
  ],
};

describe("import order validation", () => {
  it("accepts valid input", () => {
    const result = validateAndResolveImportOrder(VALID_REQUEST);
    expect("message" in result).toBe(false);
    if (!("message" in result)) {
      expect(result.requestId).toBe(VALID_REQUEST.requestId);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]!.offer_id).toBe(VALID_REQUEST.lines[0]!.offerId);
      expect(result.lines[0]!.quantity).toBe(2);
    }
  });

  it("rejects non-object input", () => {
    const result = validateAndResolveImportOrder(null);
    expect("ok" in result && result.ok).toBe(false);
  });

  it("rejects invalid requestId", () => {
    const result = validateAndResolveImportOrder({
      ...VALID_REQUEST,
      requestId: "not-a-uuid",
    });
    expect("ok" in result && result.ok).toBe(false);
  });

  it("rejects empty lines", () => {
    const result = validateAndResolveImportOrder({
      ...VALID_REQUEST,
      lines: [],
    });
    expect("ok" in result && result.ok).toBe(false);
    if ("ok" in result && !result.ok) {
      expect(result.fieldErrors?.cart).toBeDefined();
    }
  });

  it("rejects lines exceeding max", () => {
    const lines = Array.from({ length: IMPORT_ORDER_MAX_LINES + 1 }, (_, i) => ({
      offerId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      offerUpdatedAt: "2026-09-10T12:00:00Z",
      quantity: 1,
    }));
    const result = validateAndResolveImportOrder({
      ...VALID_REQUEST,
      lines,
    });
    expect("ok" in result && result.ok).toBe(false);
  });

  it("rejects invalid offerId", () => {
    const result = validateAndResolveImportOrder({
      ...VALID_REQUEST,
      lines: [{ ...VALID_REQUEST.lines[0]!, offerId: "bad" }],
    });
    expect("ok" in result && result.ok).toBe(false);
  });

  it("rejects invalid offerUpdatedAt", () => {
    const result = validateAndResolveImportOrder({
      ...VALID_REQUEST,
      lines: [{ ...VALID_REQUEST.lines[0]!, offerUpdatedAt: "not-a-date" }],
    });
    expect("ok" in result && result.ok).toBe(false);
  });

  it("rejects quantity out of range", () => {
    const result = validateAndResolveImportOrder({
      ...VALID_REQUEST,
      lines: [{ ...VALID_REQUEST.lines[0]!, quantity: 0 }],
    });
    expect("ok" in result && result.ok).toBe(false);

    const result2 = validateAndResolveImportOrder({
      ...VALID_REQUEST,
      lines: [{ ...VALID_REQUEST.lines[0]!, quantity: IMPORT_ORDER_MAX_QUANTITY + 1 }],
    });
    expect("ok" in result2 && result2.ok).toBe(false);
  });

  it("rejects duplicate offerIds", () => {
    const result = validateAndResolveImportOrder({
      ...VALID_REQUEST,
      lines: [
        VALID_REQUEST.lines[0]!,
        { ...VALID_REQUEST.lines[0]!, quantity: 1 },
      ],
    });
    expect("ok" in result && result.ok).toBe(false);
  });

  it("rejects customer missing required fields", () => {
    const result = validateAndResolveImportOrder({
      ...VALID_REQUEST,
      customer: { name: "", phone: "+51999111222", district: "San Isidro", address: "Av. 1" },
    });
    expect("ok" in result && result.ok).toBe(false);
    if ("ok" in result && !result.ok) {
      expect(result.fieldErrors?.name).toBeDefined();
    }
  });

  it("rejects invalid phone", () => {
    const result = validateAndResolveImportOrder({
      ...VALID_REQUEST,
      customer: { ...VALID_REQUEST.customer, phone: "123" },
    });
    expect("ok" in result && result.ok).toBe(false);
    if ("ok" in result && !result.ok) {
      expect(result.fieldErrors?.phone).toBeDefined();
    }
  });

  it("rejects missing district", () => {
    const result = validateAndResolveImportOrder({
      ...VALID_REQUEST,
      customer: { ...VALID_REQUEST.customer, district: "" },
    });
    expect("ok" in result && result.ok).toBe(false);
    if ("ok" in result && !result.ok) {
      expect(result.fieldErrors?.district).toBeDefined();
    }
  });

  it("rejects missing address", () => {
    const result = validateAndResolveImportOrder({
      ...VALID_REQUEST,
      customer: { ...VALID_REQUEST.customer, address: "" },
    });
    expect("ok" in result && result.ok).toBe(false);
    if ("ok" in result && !result.ok) {
      expect(result.fieldErrors?.address).toBeDefined();
    }
  });

  it("normalizes note to empty string when omitted", () => {
    const result = validateAndResolveImportOrder({
      ...VALID_REQUEST,
      customer: { name: "Test", phone: "+51999111222", district: "San Isidro", address: "Av. 1" },
    });
    if ("ok" in result && result.ok) {
      expect(result.customer.note).toBe("");
    }
  });

  it("truncates oversized text fields", () => {
    const result = validateAndResolveImportOrder({
      ...VALID_REQUEST,
      customer: {
        ...VALID_REQUEST.customer,
        note: "x".repeat(600),
      },
    });
    if ("ok" in result && result.ok) {
      expect(result.customer.note.length).toBeLessThanOrEqual(501);
    }
  });
});
