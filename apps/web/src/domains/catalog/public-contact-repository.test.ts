import { describe, expect, it } from "vitest";
import { mapPublicContact } from "./public-contact-repository";

describe("public_contact public read mapping", () => {
  it("accepts only the typed contact contract", () => {
    expect(mapPublicContact({
      whatsappNumber: "51926390591",
      whatsappDisplay: "926 390 591",
      contactEmail: "dominiocruzial@gmail.com",
    })).toEqual({
      whatsappNumber: "51926390591",
      whatsappDisplay: "926 390 591",
      contactEmail: "dominiocruzial@gmail.com",
    });
    expect(mapPublicContact({ whatsappNumber: "secret" })).toBeNull();
    expect(mapPublicContact(["arbitrary", "json"])).toBeNull();
  });
});
