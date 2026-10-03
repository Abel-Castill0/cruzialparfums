import { describe, expect, it } from "vitest";
import {
  LIMA_DISTRICTS,
  LIMA_GRID_COLS,
  LIMA_GRID_ROWS,
  MOTORIZADO_RESTRICTED_DISTRICTS,
  isMotorizadoRestricted,
} from "./lima-districts";
import { shalomAgencyDelivery } from "./parfums-delivery";
import { SHALOM_AGENCIES } from "./shalom-agencies";

const METRO = new Set(LIMA_DISTRICTS.map((district) => district.name));

describe("Lima district tile map", () => {
  it("covers the 43 districts of Lima Metropolitana exactly once", () => {
    expect(LIMA_DISTRICTS).toHaveLength(43);
    expect(METRO.size).toBe(43);
  });

  it("gives every district its own tile inside the grid", () => {
    const cells = new Set<string>();
    for (const district of LIMA_DISTRICTS) {
      expect(district.col).toBeGreaterThanOrEqual(0);
      expect(district.col).toBeLessThan(LIMA_GRID_COLS);
      expect(district.row).toBeGreaterThanOrEqual(0);
      expect(district.row).toBeLessThan(LIMA_GRID_ROWS);
      cells.add(`${district.col},${district.row}`);
    }
    expect(cells.size).toBe(LIMA_DISTRICTS.length);
  });

  it("only restricts districts that exist on the map", () => {
    for (const name of MOTORIZADO_RESTRICTED_DISTRICTS) expect(METRO.has(name), name).toBe(true);
    expect(isMotorizadoRestricted("Miraflores")).toBe(false);
    expect(isMotorizadoRestricted("Comas")).toBe(true);
  });
});

describe("Shalom agency directory", () => {
  it("has unique ids and unique accepted delivery texts that fit the order field", () => {
    expect(new Set(SHALOM_AGENCIES.map((agency) => agency.id)).size).toBe(SHALOM_AGENCIES.length);
    const labels = SHALOM_AGENCIES.map(shalomAgencyDelivery);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) expect(label.length, label).toBeLessThanOrEqual(120);
  });

  it("never lists an agency without an address or hours", () => {
    for (const agency of SHALOM_AGENCIES) {
      expect(agency.address.trim().length, agency.id).toBeGreaterThan(5);
      expect(agency.hours.trim().length, agency.id).toBeGreaterThan(0);
    }
  });

  it("keeps coordinates inside the Lima region when present, both or neither", () => {
    for (const agency of SHALOM_AGENCIES) {
      expect(agency.lat === undefined, agency.id).toBe(agency.lng === undefined);
      if (agency.lat === undefined || agency.lng === undefined) continue;
      expect(agency.lat).toBeGreaterThan(-13.2);
      expect(agency.lat).toBeLessThan(-10.5);
      expect(agency.lng).toBeGreaterThan(-78);
      expect(agency.lng).toBeLessThan(-76.2);
    }
  });

  it("maps every Lima Metropolitana agency to a tile, with the rest outside the 43 districts", () => {
    const metro = SHALOM_AGENCIES.filter((agency) => METRO.has(agency.district));
    expect(metro.length).toBeGreaterThan(100);
    const region = SHALOM_AGENCIES.filter((agency) => !METRO.has(agency.district));
    // Region towns must not be a misspelled metro district.
    for (const agency of region) {
      expect(["Barranca", "Chancay", "Chilca", "Huacho", "Huaura", "Imperial", "Mala", "Nuevo Imperial", "Paramonga", "San Antonio", "San Vicente de Cañete", "Sayán", "Supe"]).toContain(agency.district);
    }
  });
});
