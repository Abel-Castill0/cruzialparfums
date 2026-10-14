import { describe, expect, it } from "vitest";
import { importHeroStatus, shortDate } from "./hero-status";

const NOW = new Date("2026-10-14T12:00:00Z");

describe("shortDate", () => {
  it("writes day, short month without the period and year, in Lima time", () => {
    expect(shortDate("2026-11-15T15:00:00Z")).toBe("15 nov 2026");
    expect(shortDate("2026-01-05T15:00:00Z")).toBe("5 ene 2026");
    expect(shortDate("2026-09-15T15:00:00Z")).toBe("15 set 2026");
  });

  it("uses Lima's calendar day, not UTC's", () => {
    // 02:00 UTC on the 21st is still the 20th at 21:00 in Lima.
    expect(shortDate("2026-11-21T02:00:00Z")).toBe("20 nov 2026");
  });

  it("returns null for an unreadable date", () => {
    expect(shortDate("pronto")).toBeNull();
  });
});

describe("importHeroStatus", () => {
  it("open: gold badge and the closing date while it is ahead", () => {
    expect(importHeroStatus({ state: "campaign", closesAt: "2026-11-20T15:00:00Z" }, NOW)).toEqual({
      badge: { label: "Abierto", tone: "open" },
      dateLine: "Cierre: 20 nov 2026",
    });
  });

  it("open: no date line when there is no closing date or it already passed", () => {
    expect(importHeroStatus({ state: "campaign", closesAt: null }, NOW).dateLine).toBeNull();
    expect(importHeroStatus({ state: "campaign", closesAt: "2026-10-01T15:00:00Z" }, NOW).dateLine).toBeNull();
  });

  it("upcoming: grey badge and an estimated opening date", () => {
    expect(importHeroStatus({ state: "upcoming", opensAt: "2026-11-15T15:00:00Z" }, NOW)).toEqual({
      badge: { label: "Próximamente", tone: "soon" },
      dateLine: "Apertura estimada: 15 nov 2026",
    });
  });

  it("upcoming: a missing or past date says 'por confirmar' instead of promising one", () => {
    expect(importHeroStatus({ state: "upcoming", opensAt: null }, NOW).dateLine).toBe("Apertura estimada: por confirmar");
    expect(importHeroStatus({ state: "upcoming", opensAt: "2026-10-01T15:00:00Z" }, NOW).dateLine).toBe("Apertura estimada: por confirmar");
  });

  it("closed: muted badge, no date", () => {
    expect(importHeroStatus({ state: "closed" }, NOW)).toEqual({ badge: { label: "Cerrado", tone: "closed" }, dateLine: null });
  });

  it("unavailable: no badge and no date (never claims a status it cannot back up)", () => {
    expect(importHeroStatus({ state: "unavailable" }, NOW)).toEqual({ badge: null, dateLine: null });
  });
});
