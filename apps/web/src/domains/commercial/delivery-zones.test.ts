import { describe, expect, it } from "vitest";
import { districtKey, isMotorizadoAllowed, motorizadoAvailability, restrictedDistrictNames, type DeliveryZone } from "./delivery-zones";

const zones: DeliveryZone[] = [
  { district: "Miraflores", isRestricted: false },
  { district: "Jesús María", isRestricted: false },
  { district: "Pucusana", isRestricted: true },
];

describe("motorcycle delivery zones", () => {
  it("covers a listed district, restricts another and knows nothing about the rest", () => {
    expect(motorizadoAvailability("Miraflores", zones)).toBe("available");
    expect(motorizadoAvailability("Pucusana", zones)).toBe("restricted");
    expect(motorizadoAvailability("Arequipa", zones)).toBe("outside_zones");
  });

  it("matches without caring about case, accents or extra spaces", () => {
    expect(motorizadoAvailability("  jesus   maria ", zones)).toBe("available");
    expect(motorizadoAvailability("PUCUSANA", zones)).toBe("restricted");
    expect(districtKey("Jesús María")).toBe("jesus maria");
  });

  it("enforces nothing while the list is empty (the owner has not validated it yet)", () => {
    expect(motorizadoAvailability("Pucusana", [])).toBe("not_enforced");
    expect(isMotorizadoAllowed("not_enforced")).toBe(true);
  });

  it("only turns the motorcycle off for restricted and unlisted districts", () => {
    expect(isMotorizadoAllowed("available")).toBe(true);
    expect(isMotorizadoAllowed("restricted")).toBe(false);
    expect(isMotorizadoAllowed("outside_zones")).toBe(false);
  });

  it("names the restricted districts for the checkout map", () => {
    expect(restrictedDistrictNames(zones)).toEqual(["Pucusana"]);
  });
});
