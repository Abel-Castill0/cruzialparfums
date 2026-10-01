import { describe, expect, it } from "vitest";
import { legalIdentityNotice, missingLegalIdentity } from "./legal-readiness";

const full = { legalName: "X S.A.C.", ruc: "20123456789", address: "Av. 1" };

describe("missingLegalIdentity", () => {
  it("is empty only when razón social, RUC and dirección are all present", () => {
    expect(missingLegalIdentity(full)).toEqual([]);
  });
  it("lists exactly the blank fields, treating whitespace as blank", () => {
    expect(missingLegalIdentity({ ...full, ruc: "  ", address: "" })).toEqual(["RUC", "dirección"]);
  });
  it("treats a missing setting as everything missing (never invents values)", () => {
    expect(missingLegalIdentity(null)).toEqual(["razón social", "RUC", "dirección"]);
  });
});

describe("legalIdentityNotice", () => {
  it("returns nothing when complete", () => {
    expect(legalIdentityNotice([])).toBeNull();
  });
  it("names what is missing", () => {
    expect(legalIdentityNotice(["RUC"])?.detail).toContain("Falta: RUC.");
  });
});
