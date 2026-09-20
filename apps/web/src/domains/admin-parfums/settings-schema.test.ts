import { describe, expect, it } from "vitest";
import { validatePublicContactSettingForm } from "./settings-schema";

const VALID = {
  whatsappNumber: "51926390591",
  whatsappDisplay: "926 390 591",
  contactEmail: "dominiocruzial@gmail.com",
};

describe("validatePublicContactSettingForm", () => {
  it("accepts the confirmed contact values", () => {
    expect(validatePublicContactSettingForm(VALID)).toEqual({ ok: true, value: VALID });
  });

  it("trims surrounding whitespace", () => {
    const result = validatePublicContactSettingForm({
      whatsappNumber: "  51926390591  ",
      whatsappDisplay: "  926 390 591  ",
      contactEmail: "  dominiocruzial@gmail.com  ",
    });
    expect(result).toEqual({ ok: true, value: VALID });
  });

  it.each([
    [{ ...VALID, whatsappNumber: "+51926390591" }, "whatsappNumber"],
    [{ ...VALID, whatsappNumber: "0926390591" }, "whatsappNumber"],
    [{ ...VALID, whatsappNumber: "abc" }, "whatsappNumber"],
    [{ ...VALID, whatsappDisplay: "" }, "whatsappDisplay"],
    [{ ...VALID, whatsappDisplay: "x".repeat(41) }, "whatsappDisplay"],
    [{ ...VALID, contactEmail: "not-an-email" }, "contactEmail"],
    [{ ...VALID, contactEmail: "" }, "contactEmail"],
  ])("rejects invalid input %#", (input, field) => {
    const result = validatePublicContactSettingForm(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[field]).toBeTruthy();
  });
});
