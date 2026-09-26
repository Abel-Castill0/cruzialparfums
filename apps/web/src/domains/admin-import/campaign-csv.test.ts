import { describe, expect, it, vi } from "vitest";
import {
  CAMPAIGN_CSV_MAX_BYTES,
  CAMPAIGN_CSV_COLUMNS,
  diffCampaignCsvRows,
  exportCampaignRowsToCsv,
  hasValidCsvQuotes,
  parseCampaignCsv,
  parseCsvText,
  readCampaignCsvFile,
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

  it.each(["=1+1", "+SUM(1,2)", "-1+2", "@cmd", "  =1+1"])("exports formula-looking text as spreadsheet text: %s", (name) => {
    const csv = exportCampaignRowsToCsv([{ ...baseRow, productName: name, presentationLabel: name }]);
    const cells = parseCsvText(csv)[1]!;
    expect(cells[1]).toBe(`'${name}`);
    expect(cells[2]).toBe(`'${name}`);
    expect(cells[3]).toBe("120.00");
  });

  it("leaves normal catalog names unchanged", () => {
    const cells = parseCsvText(exportCampaignRowsToCsv([baseRow]))[1]!;
    expect(cells[1]).toBe(baseRow.productName);
    expect(cells[2]).toBe(baseRow.presentationLabel);
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

describe("campaign CSV size bounds", () => {
  it("rejects an oversized File before invoking text()", async () => {
    const text = vi.fn().mockResolvedValue("ignored");
    const result = await readCampaignCsvFile({ size: CAMPAIGN_CSV_MAX_BYTES + 1, text });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("2 MiB") });
    expect(text).not.toHaveBeenCalled();
  });

  it("allows a File exactly at the byte limit to reach text()", async () => {
    const text = vi.fn().mockResolvedValue(exportCampaignRowsToCsv([baseRow]));
    const result = await readCampaignCsvFile({ size: CAMPAIGN_CSV_MAX_BYTES, text });
    expect(text).toHaveBeenCalledOnce();
    expect(result.ok).toBe(true);
  });

  it("rejects oversized raw parser input before scanning rows", () => {
    const result = parseCampaignCsv("x".repeat(CAMPAIGN_CSV_MAX_BYTES + 1));
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("2 MiB") });
  });

  it("continues to reject more than 2000 rows", () => {
    const header = CAMPAIGN_CSV_COLUMNS.join(",");
    const row = `${baseRow.offerId},Product,100 ml,120.00,PEN,available,${baseRow.updatedAt}`;
    const result = parseCampaignCsv([header, ...Array.from({ length: 2001 }, () => row)].join("\n"));
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("2000") });
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

describe("hasValidCsvQuotes", () => {
  it("rejects a quote appearing mid-unquoted-field, which parseCsvText would otherwise silently absorb", () => {
    // Without this guard, `1"00"` parses via parseCsvText to the clean-
    // looking value "100" — indistinguishable from a deliberately entered
    // price of 100 by the time it reaches validation.
    expect(hasValidCsvQuotes('offer,1"00"')).toBe(false);
    expect(parseCsvText('offer,1"00"')[0]).toEqual(["offer", "100"]);
  });

  it("rejects a stray quote at the very start too, and an unclosed quoted field", () => {
    expect(hasValidCsvQuotes('a,"unclosed')).toBe(false);
    expect(hasValidCsvQuotes('a,b"')).toBe(false);
  });

  it("rejects garbage between a quoted field's closing quote and the next delimiter", () => {
    expect(hasValidCsvQuotes('a,"b"x,c')).toBe(false);
  });

  it.each([
    ["plain unquoted fields", "a,b,c"],
    ["a quoted field with an embedded comma", 'a,"b,c",d'],
    ["a doubled (escaped) quote inside a quoted field", 'a,"say ""hi""",c'],
    ["CRLF between rows", "a,b\r\nc,d"],
    ["a quoted field spanning multiple lines", '"multi\nline",e,f'],
    ["a fully-quoted field with no special characters", '"a",b,c'],
  ])("accepts valid quoting: %s", (_label, text) => {
    expect(hasValidCsvQuotes(text)).toBe(true);
  });
});

describe("parseCampaignCsv rejects malformed quoting end to end", () => {
  it("rejects a CSV whose price field contains a stray mid-field quote instead of silently accepting it as a clean price", () => {
    const csv = `offer_id,product_name,presentation_label,price,currency,availability,updated_at\n${baseRow.offerId},P,L,1"00",PEN,available,`;
    const result = parseCampaignCsv(csv);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("comillas") });
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
