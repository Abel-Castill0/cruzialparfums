import { describe, expect, it } from "vitest";
import { describeImportGateDate, IMPORT_GATE_FALLBACK } from "./import-gate";

const NOW = new Date("2026-10-13T12:00:00Z");

describe("describeImportGateDate", () => {
  it("falls back to Próximamente without a date", () => {
    expect(describeImportGateDate(null, NOW)).toBe(IMPORT_GATE_FALLBACK);
  });

  it("falls back to Próximamente when the date is unreadable", () => {
    expect(describeImportGateDate("pronto", NOW)).toBe(IMPORT_GATE_FALLBACK);
  });

  it("formats a date in Lima time, without the year when it is this year", () => {
    expect(describeImportGateDate("2026-11-14T15:00:00Z", NOW)).toBe("Apertura estimada: 14 de noviembre");
  });

  it("uses Lima's calendar day, not UTC's", () => {
    // 02:00 UTC on the 15th is still the 14th at 21:00 in Lima.
    expect(describeImportGateDate("2026-11-15T02:00:00Z", NOW)).toBe("Apertura estimada: 14 de noviembre");
  });

  it("adds the year when the date is not this year", () => {
    expect(describeImportGateDate("2027-01-10T15:00:00Z", NOW)).toBe("Apertura estimada: 10 de enero de 2027");
  });
});
