import { describe, expect, it } from "vitest";
import {
  getBusinessUnitSettings,
  IMPORT_SETTINGS,
  PARFUMS_SETTINGS,
} from "./settings";

describe("business-unit settings", () => {
  it("keeps the latest client-confirmed public contact in one source", () => {
    expect(PARFUMS_SETTINGS).toEqual({
      whatsappNumber: "51926390591",
      whatsappDisplay: "926 390 591",
      contactEmail: "dominiocruzial@gmail.com",
    });
    expect(IMPORT_SETTINGS).toEqual(PARFUMS_SETTINGS);
  });

  it("returns separate settings objects for Parfums and Import", () => {
    expect(IMPORT_SETTINGS).not.toBe(PARFUMS_SETTINGS);
    expect(getBusinessUnitSettings("parfums")).toBe(PARFUMS_SETTINGS);
    expect(getBusinessUnitSettings("import")).toBe(IMPORT_SETTINGS);
  });
});
