import { describe, expect, it } from "vitest";
import { normalizeParfumsCustomerPhoneForWhatsApp } from "./customer-whatsapp-link";

describe("normalizeParfumsCustomerPhoneForWhatsApp", () => {
  it("prepends 51 to a bare 9-digit Peru mobile number", () => {
    expect(normalizeParfumsCustomerPhoneForWhatsApp("926390591")).toBe("51926390591");
  });

  it("accepts formatting characters around a valid number", () => {
    expect(normalizeParfumsCustomerPhoneForWhatsApp("+51 926 390 591")).toBe("51926390591");
    expect(normalizeParfumsCustomerPhoneForWhatsApp("926-390-591")).toBe("51926390591");
  });

  it("keeps an already-prefixed 11-digit number as-is", () => {
    expect(normalizeParfumsCustomerPhoneForWhatsApp("51926390591")).toBe("51926390591");
  });

  it("does not invent a country code for a number that isn't a Peru mobile", () => {
    expect(normalizeParfumsCustomerPhoneForWhatsApp("123456789")).toBeNull(); // doesn't start with 9
    expect(normalizeParfumsCustomerPhoneForWhatsApp("12345")).toBeNull(); // too short
    expect(normalizeParfumsCustomerPhoneForWhatsApp("1234567890123")).toBeNull(); // unrelated length
    expect(normalizeParfumsCustomerPhoneForWhatsApp("")).toBeNull();
  });
});
