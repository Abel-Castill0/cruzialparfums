import { describe, expect, it } from "vitest";
import {
  isCampaignStatus,
  isValidExpectedTimestamp,
  isoToLimaDatetimeLocal,
  limaDatetimeLocalToIso,
  validateCampaignForm,
  validateDuplicateCampaignForm,
} from "./campaign-schema";

const valid = {
  number: "6",
  name: "Sexto Consolidado",
  opensAt: "",
  closesAt: "",
  publicMessage: "",
};

describe("validateCampaignForm", () => {
  it("normalizes a valid minimal payload", () => {
    const result = validateCampaignForm(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        number: 6,
        name: "Sexto Consolidado",
        opensAt: null,
        closesAt: null,
        publicMessage: null,
      });
    }
  });

  it("converts Lima-local opens/closes into UTC timestamptz strings", () => {
    const result = validateCampaignForm({
      ...valid,
      opensAt: "2026-09-10T09:00",
      closesAt: "2026-09-20T23:59",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Lima is a fixed UTC-5 offset: 09:00 Lima == 14:00Z the same day.
      expect(result.value.opensAt).toBe("2026-09-10T14:00:00.000Z");
      expect(result.value.closesAt).toBe("2026-09-21T04:59:00.000Z");
    }
  });

  it.each([
    ["number", "0"],
    ["number", "-1"],
    ["number", "abc"],
    ["number", ""],
    ["name", ""],
    ["name", "x".repeat(201)],
  ])("rejects an invalid %s value (%s)", (field, value) => {
    const result = validateCampaignForm({ ...valid, [field]: value });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors)).toContain(field);
  });

  it("rejects closes_at before opens_at", () => {
    const result = validateCampaignForm({
      ...valid,
      opensAt: "2026-09-20T00:00",
      closesAt: "2026-09-10T00:00",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.closesAt).toBeTruthy();
  });

  it("rejects a public message over 2000 characters", () => {
    const result = validateCampaignForm({ ...valid, publicMessage: "x".repeat(2001) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.publicMessage).toBeTruthy();
  });
});

describe("Lima timezone round-trip", () => {
  it("round-trips a Lima wall-clock time through ISO storage", () => {
    const iso = limaDatetimeLocalToIso("2026-09-10T09:00");
    expect(iso).toBe("2026-09-10T14:00:00.000Z");
    expect(isoToLimaDatetimeLocal(iso)).toBe("2026-09-10T09:00");
  });

  it("returns an empty string for a null stored value", () => {
    expect(isoToLimaDatetimeLocal(null)).toBe("");
  });

  it("rejects a malformed datetime-local string", () => {
    expect(limaDatetimeLocalToIso("not-a-date")).toBeNull();
  });
});

describe("isCampaignStatus", () => {
  it("accepts the confirmed statuses only", () => {
    expect(isCampaignStatus("draft")).toBe(true);
    expect(isCampaignStatus("open")).toBe(true);
    expect(isCampaignStatus("published")).toBe(false);
    expect(isCampaignStatus(42)).toBe(false);
  });
});

describe("isValidExpectedTimestamp", () => {
  it("accepts an ISO timestamptz string and rejects garbage", () => {
    expect(isValidExpectedTimestamp("2026-09-10T14:00:00.000Z")).toBe(true);
    expect(isValidExpectedTimestamp("not-a-date")).toBe(false);
    expect(isValidExpectedTimestamp(123)).toBe(false);
  });
});

describe("validateDuplicateCampaignForm", () => {
  it("accepts a valid new number and name", () => {
    const result = validateDuplicateCampaignForm({ newNumber: "7", newName: "Séptimo Consolidado" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ newNumber: 7, newName: "Séptimo Consolidado" });
  });

  it("rejects a non-positive or non-integer number", () => {
    expect(validateDuplicateCampaignForm({ newNumber: "0", newName: "x" }).ok).toBe(false);
    expect(validateDuplicateCampaignForm({ newNumber: "-1", newName: "x" }).ok).toBe(false);
    expect(validateDuplicateCampaignForm({ newNumber: "1.5", newName: "x" }).ok).toBe(false);
    expect(validateDuplicateCampaignForm({ newNumber: "", newName: "x" }).ok).toBe(false);
  });

  it("rejects a blank or whitespace-only name", () => {
    expect(validateDuplicateCampaignForm({ newNumber: "1", newName: "" }).ok).toBe(false);
    expect(validateDuplicateCampaignForm({ newNumber: "1", newName: "   " }).ok).toBe(false);
  });

  it("trims the name", () => {
    const result = validateDuplicateCampaignForm({ newNumber: "1", newName: "  Copia  " });
    if (result.ok) expect(result.value.newName).toBe("Copia");
  });

  it("never accepts business_unit_id/status/actor/currency fields — they are not part of this input shape", () => {
    const result = validateDuplicateCampaignForm({
      newNumber: "1",
      newName: "Copia",
      businessUnitId: "should-be-ignored",
      status: "open",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(Object.keys(result.value)).toEqual(["newNumber", "newName"]);
  });
});
