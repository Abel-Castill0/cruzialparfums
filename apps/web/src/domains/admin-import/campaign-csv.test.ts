import { describe, expect, it, vi } from "vitest";
import {
  CAMPAIGN_CSV_MAX_BYTES,
  CAMPAIGN_CSV_COLUMNS,
  diffCampaignCsvRows,
  exportCampaignRowsToCsv,
  parseCampaignCsv,
  parseCsv,
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
    const cells = (parseCsv(csv) as { rows: string[][] }).rows[1]!;
    expect(cells[1]).toBe(`'${name}`);
    expect(cells[2]).toBe(`'${name}`);
    expect(cells[3]).toBe("120.00");
  });

  it("leaves normal catalog names unchanged", () => {
    const cells = (parseCsv(exportCampaignRowsToCsv([baseRow])) as { rows: string[][] }).rows[1]!;
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

describe("parseCsv — the single strict CSV grammar", () => {
  const rowsOf = (text: string) => {
    const result = parseCsv(text);
    if (!result.ok) throw new Error(`unexpected rejection: ${result.reason} at line ${result.line}`);
    return result.rows;
  };

  it.each([
    ["a quote inside an unquoted field", 'offer,1"00"', "quote"],
    ["a lone CR splicing a bare and a quoted fragment", 'offer,1\r"00"', "bare_cr"],
    ["an unterminated quoted field", 'offer,"100', "unterminated"],
    ["content after a closing quote", 'offer,"100"x', "quote"],
    ["a trailing stray quote", 'offer,100"', "quote"],
    ["a lone CR between plain records", "a,b\rc,d", "bare_cr"],
    ["a space after a closing quote", 'a,"b" ,c', "quote"],
  ] as const)("rejects %s — never yields a clean-looking value", (_label, text, reason) => {
    const result = parseCsv(text);
    expect(result).toMatchObject({ ok: false, reason });
    expect(JSON.stringify(result)).not.toContain('"100"');
  });

  it("reports the physical line of a rejection", () => {
    expect(parseCsv('h1,h2\nok,ok\nbad,1"00"')).toEqual({ ok: false, line: 3, reason: "quote" });
  });

  it.each([
    ["an escaped quote", 'a,"a""b"', [["a", 'a"b']]],
    ["an embedded comma", 'x,"a,b"', [["x", "a,b"]]],
    ["a multiline quoted field", '"multi\nline",e\n"crlf\r\ninside",f', [["multi\nline", "e"], ["crlf\r\ninside", "f"]]],
    ["CRLF as ONE record delimiter", "a,b\r\nc,d\r\n", [["a", "b"], ["c", "d"]]],
    ["LF delimiters", "a,b\nc,d\n", [["a", "b"], ["c", "d"]]],
    ["BOM + quoted first header", '\uFEFF"offer_id",price\r\n1,2', [["offer_id", "price"], ["1", "2"]]],
    ["ordinary BOM", "\uFEFFoffer_id,price\n1,2", [["offer_id", "price"], ["1", "2"]]],
    ["empty fields (bare and quoted)", 'a,,""\n,b,', [["a", "", ""], ["", "b", ""]]],
    ["blank records are omitted", "a,b\n\n\r\n,\nc,d", [["a", "b"], ["c", "d"]]],
    ["a fully quoted plain field", '"a",b', [["a", "b"]]],
  ] as const)("accepts %s", (_label, text, expected) => {
    expect(rowsOf(text)).toEqual(expected);
  });

  it("round-trips the campaign export exactly, including hostile text", () => {
    const hostile = { ...baseRow, productName: 'Brand "X", Ltd\nline 2', presentationLabel: "=cmd" };
    const rows = rowsOf(exportCampaignRowsToCsv([hostile]));
    expect(rows[0]).toEqual([...CAMPAIGN_CSV_COLUMNS]);
    expect(rows[1]![1]).toBe(hostile.productName);
    expect(rows[1]![2]).toBe("'=cmd");
    expect(rows[1]![0]).toBe(hostile.offerId);
  });
});

describe("parseCampaignCsv rejects malformed input end to end", () => {
  const header = "offer_id,product_name,presentation_label,price,currency,availability,updated_at";
  it.each([
    ['1"00"'],
    ['1\r"00"'],
    ['"100'],
    ['"100"x'],
    ['100"'],
  ])("rejects the price field %j instead of accepting a clean price", (price) => {
    const result = parseCampaignCsv(`${header}\n${baseRow.offerId},P,L,${price},PEN,available,`);
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain('"100"');
  });

  it("accepts a BOM-prefixed export whose first header is quoted", () => {
    const csv = `\uFEFF"offer_id",product_name,presentation_label,price,currency,availability,updated_at\r\n${baseRow.offerId},P,L,120.00,PEN,available,${baseRow.updatedAt}`;
    expect(parseCampaignCsv(csv)).toMatchObject({ ok: true, rows: [{ offerId: baseRow.offerId, price: "120.00" }] });
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
