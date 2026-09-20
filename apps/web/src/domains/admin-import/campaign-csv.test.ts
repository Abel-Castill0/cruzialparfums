import { describe, expect, it } from "vitest";
import {
  diffCampaignCsvRows,
  exportCampaignRowsToCsv,
  parseCampaignCsv,
  parseCsvText,
  type CampaignCsvSourceRow,
} from "./campaign-csv";

const baseRow: CampaignCsvSourceRow = {
  offerId: "11111111-0000-4000-8000-000000000001",
  productName: "Armaf Club de Nuit",
  presentationLabel: "100 ml",
  priceAmount: "120.00",
  currency: "PEN",
  availabilityStatus: "available",
  updatedAt: "2026-09-20T10:00:00Z",
};

describe("exportCampaignRowsToCsv / parseCampaignCsv round-trip", () => {
  it("exports a header and one row per offer", () => {
    const csv = exportCampaignRowsToCsv([baseRow]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("offer_id,product_name,presentation_label,price,currency,availability,updated_at");
    expect(lines[1]).toContain(baseRow.offerId);
  });

  it("escapes commas and quotes in text fields", () => {
    const csv = exportCampaignRowsToCsv([{ ...baseRow, productName: 'Brand "X", Ltd' }]);
    expect(csv).toContain('"Brand ""X"", Ltd"');
  });

  it("round-trips through parseCampaignCsv", () => {
    const csv = exportCampaignRowsToCsv([baseRow]);
    const result = parseCampaignCsv(csv);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]!.offerId).toBe(baseRow.offerId);
      expect(result.rows[0]!.price).toBe(baseRow.priceAmount);
    }
  });

  it("rejects a CSV missing required columns", () => {
    const result = parseCampaignCsv("foo,bar\n1,2");
    expect(result.ok).toBe(false);
  });

  it("rejects an empty CSV", () => {
    const result = parseCampaignCsv("");
    expect(result.ok).toBe(false);
  });
});

describe("parseCsvText", () => {
  it("handles quoted fields with embedded commas and newlines", () => {
    const rows = parseCsvText('a,"b,c",d\n"multi\nline",e,f');
    expect(rows).toEqual([
      ["a", "b,c", "d"],
      ["multi\nline", "e", "f"],
    ]);
  });
});

describe("diffCampaignCsvRows", () => {
  const current = new Map([[baseRow.offerId, baseRow]]);

  it("classifies an identical row as unchanged", () => {
    const [diff] = diffCampaignCsvRows(current, [
      { lineNumber: 2, offerId: baseRow.offerId, price: "120.00", currency: "PEN", availability: "available", updatedAt: baseRow.updatedAt },
    ]);
    expect(diff!.classification).toBe("unchanged");
  });

  it("classifies a price-only change", () => {
    const [diff] = diffCampaignCsvRows(current, [
      { lineNumber: 2, offerId: baseRow.offerId, price: "135.00", currency: "PEN", availability: "available", updatedAt: baseRow.updatedAt },
    ]);
    expect(diff!.classification).toBe("price_changed");
    expect(diff!.newPrice).toBe("135.00");
  });

  it("classifies an availability-only change", () => {
    const [diff] = diffCampaignCsvRows(current, [
      { lineNumber: 2, offerId: baseRow.offerId, price: "120.00", currency: "PEN", availability: "out_of_stock", updatedAt: baseRow.updatedAt },
    ]);
    expect(diff!.classification).toBe("availability_changed");
  });

  it("classifies both changed", () => {
    const [diff] = diffCampaignCsvRows(current, [
      { lineNumber: 2, offerId: baseRow.offerId, price: "99.00", currency: "PEN", availability: "unconfirmed", updatedAt: baseRow.updatedAt },
    ]);
    expect(diff!.classification).toBe("both_changed");
  });

  it("classifies an unknown offer_id as not_found — never invents a match", () => {
    const [diff] = diffCampaignCsvRows(current, [
      { lineNumber: 2, offerId: "99999999-0000-4000-8000-000000000099", price: "10.00", currency: "PEN", availability: "available", updatedAt: "" },
    ]);
    expect(diff!.classification).toBe("not_found");
  });

  it("classifies a stale row (updated_at mismatch) — never silently overwrites", () => {
    const [diff] = diffCampaignCsvRows(current, [
      { lineNumber: 2, offerId: baseRow.offerId, price: "150.00", currency: "PEN", availability: "available", updatedAt: "2026-09-19T00:00:00Z" },
    ]);
    expect(diff!.classification).toBe("stale");
  });

  it("classifies an invalid price as invalid, not silently coerced", () => {
    const [diff] = diffCampaignCsvRows(current, [
      { lineNumber: 2, offerId: baseRow.offerId, price: "not-a-price", currency: "PEN", availability: "available", updatedAt: baseRow.updatedAt },
    ]);
    expect(diff!.classification).toBe("invalid");
  });

  it("classifies an invalid availability value as invalid", () => {
    const [diff] = diffCampaignCsvRows(current, [
      { lineNumber: 2, offerId: baseRow.offerId, price: "120.00", currency: "PEN", availability: "sold_out", updatedAt: baseRow.updatedAt },
    ]);
    expect(diff!.classification).toBe("invalid");
  });

  it("rejects a currency change as invalid — currency is never editable via CSV", () => {
    const [diff] = diffCampaignCsvRows(current, [
      { lineNumber: 2, offerId: baseRow.offerId, price: "120.00", currency: "USD", availability: "available", updatedAt: baseRow.updatedAt },
    ]);
    expect(diff!.classification).toBe("invalid");
  });

  it("classifies a duplicate offer_id within the same file as invalid", () => {
    const diffs = diffCampaignCsvRows(current, [
      { lineNumber: 2, offerId: baseRow.offerId, price: "120.00", currency: "PEN", availability: "available", updatedAt: baseRow.updatedAt },
      { lineNumber: 3, offerId: baseRow.offerId, price: "130.00", currency: "PEN", availability: "available", updatedAt: baseRow.updatedAt },
    ]);
    expect(diffs[1]!.classification).toBe("invalid");
  });

  it("classifies a blank offer_id as invalid", () => {
    const [diff] = diffCampaignCsvRows(current, [
      { lineNumber: 2, offerId: "", price: "120.00", currency: "PEN", availability: "available", updatedAt: "" },
    ]);
    expect(diff!.classification).toBe("invalid");
  });
});
