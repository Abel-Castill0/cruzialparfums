import { isValidMoneyText, normalizeMoneyText, type CampaignProductAvailability } from "./campaign-products-schema";

/**
 * Cruzial's own CSV format for bulk campaign offer management (price +
 * availability only — never currency, never structural product/presentation
 * data). This is a self-contained, Cruzial-authoritative template: it does
 * not attempt to match any supplier's proprietary export format.
 *
 * Round-trip identity is offer_id (campaign_products.id) — the one stable,
 * unambiguous key every row already has. A CSV row whose offer_id does not
 * match a currently-configured offer is classified "not_found" and never
 * applied; this workflow manages EXISTING offers at scale, it does not add
 * new product/presentation combinations (that stays the picker's job, which
 * already validates against the live catalog).
 */

export const CAMPAIGN_CSV_COLUMNS = [
  "offer_id",
  "product_name",
  "presentation_label",
  "price",
  "currency",
  "availability",
  "updated_at",
] as const;

// A full campaign holds at most 1500 offers. 2 MiB leaves ample room for
// names/labels while preventing an accidental supplier file from being read
// and parsed without a bound in the Admin browser.
export const CAMPAIGN_CSV_MAX_BYTES = 2 * 1024 * 1024;
const CSV_TOO_LARGE_MESSAGE = "El CSV supera 2 MiB. Exporta el consolidado y usa ese archivo como plantilla.";

export type CampaignCsvSourceRow = {
  offerId: string;
  productName: string;
  presentationLabel: string | null;
  priceAmount: string;
  currency: string;
  availabilityStatus: CampaignProductAvailability;
  updatedAt: string;
};

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function spreadsheetSafeText(value: string): string {
  return /^\s*[=+\-@]/u.test(value) ? `'${value}` : value;
}

export function exportCampaignRowsToCsv(rows: CampaignCsvSourceRow[]): string {
  const lines = [CAMPAIGN_CSV_COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.offerId,
        row.productName,
        row.presentationLabel ?? "",
        row.priceAmount,
        row.currency,
        row.availabilityStatus,
        row.updatedAt,
      ]
        .map((value, index) => csvEscape(index === 1 || index === 2
          ? spreadsheetSafeText(String(value))
          : String(value)))
        .join(","),
    );
  }
  return lines.join("\r\n");
}

/** Minimal RFC-4180-ish CSV line parser: handles quoted fields, escaped
 * quotes, and commas/newlines inside quotes. No external dependency — this
 * format is simple enough (7 flat text columns) not to need one. */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const normalized = text.replace(/^﻿/, "");

  while (i < normalized.length) {
    const char = normalized[i];
    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export type CampaignCsvParsedRow = {
  lineNumber: number;
  offerId: string;
  price: string;
  currency: string;
  availability: string;
  updatedAt: string;
};

export type CampaignCsvParseResult =
  | { ok: true; rows: CampaignCsvParsedRow[] }
  | { ok: false; error: string };

export async function readCampaignCsvFile(file: Pick<File, "size" | "text">): Promise<CampaignCsvParseResult> {
  if (file.size > CAMPAIGN_CSV_MAX_BYTES) return { ok: false, error: CSV_TOO_LARGE_MESSAGE };
  try {
    return parseCampaignCsv(await file.text());
  } catch {
    return { ok: false, error: "No pudimos leer el CSV. Vuelve a exportarlo e inténtalo otra vez." };
  }
}

export function parseCampaignCsv(text: string): CampaignCsvParseResult {
  if (text.length > CAMPAIGN_CSV_MAX_BYTES) return { ok: false, error: CSV_TOO_LARGE_MESSAGE };
  const rows = parseCsvText(text);
  if (rows.length === 0) return { ok: false, error: "El archivo CSV está vacío." };

  const header = rows[0]!.map((cell) => cell.trim().toLowerCase());
  const idx = {
    offerId: header.indexOf("offer_id"),
    price: header.indexOf("price"),
    currency: header.indexOf("currency"),
    availability: header.indexOf("availability"),
    updatedAt: header.indexOf("updated_at"),
  };
  if (idx.offerId < 0 || idx.price < 0 || idx.availability < 0) {
    return {
      ok: false,
      error: "El archivo debe incluir al menos las columnas offer_id, price y availability (usa el CSV exportado como plantilla).",
    };
  }

  const parsed: CampaignCsvParsedRow[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i]!;
    parsed.push({
      lineNumber: i + 1,
      offerId: (cells[idx.offerId] ?? "").trim(),
      price: (cells[idx.price] ?? "").trim(),
      currency: idx.currency >= 0 ? (cells[idx.currency] ?? "").trim() : "PEN",
      availability: (cells[idx.availability] ?? "").trim(),
      updatedAt: idx.updatedAt >= 0 ? (cells[idx.updatedAt] ?? "").trim() : "",
    });
  }
  if (parsed.length === 0) return { ok: false, error: "El archivo no contiene filas de datos." };
  if (parsed.length > 2000) {
    return { ok: false, error: "El archivo tiene demasiadas filas (máximo 2000 por importación)." };
  }
  return { ok: true, rows: parsed };
}

export type CampaignCsvRowClassification =
  | "unchanged"
  | "price_changed"
  | "availability_changed"
  | "both_changed"
  | "stale"
  | "invalid"
  | "not_found";

export type CampaignCsvDiffRow = {
  lineNumber: number;
  offerId: string;
  classification: CampaignCsvRowClassification;
  reason?: string;
  productName?: string;
  presentationLabel?: string | null;
  currentPrice?: string;
  newPrice?: string;
  currentAvailability?: CampaignProductAvailability;
  newAvailability?: CampaignProductAvailability;
};

const VALID_AVAILABILITY: CampaignProductAvailability[] = ["unconfirmed", "available", "out_of_stock"];

function isCampaignAvailability(value: string): value is CampaignProductAvailability {
  return (VALID_AVAILABILITY as string[]).includes(value);
}

/** Pure diff: never trusts the CSV as authority. `current` is the campaign's
 * live-loaded row set (offerId -> row) — the server re-validates everything
 * again at save time regardless (admin_set_campaign_products), this is just
 * an honest preview so the admin isn't surprised by what "Guardar
 * productos" is about to send. */
export function diffCampaignCsvRows(
  current: Map<string, CampaignCsvSourceRow>,
  parsedRows: CampaignCsvParsedRow[],
): CampaignCsvDiffRow[] {
  const seen = new Set<string>();
  const results: CampaignCsvDiffRow[] = [];

  for (const parsedRow of parsedRows) {
    if (!parsedRow.offerId) {
      results.push({ lineNumber: parsedRow.lineNumber, offerId: "", classification: "invalid", reason: "Fila sin offer_id." });
      continue;
    }
    if (seen.has(parsedRow.offerId)) {
      results.push({
        lineNumber: parsedRow.lineNumber,
        offerId: parsedRow.offerId,
        classification: "invalid",
        reason: "offer_id duplicado dentro del mismo archivo.",
      });
      continue;
    }
    seen.add(parsedRow.offerId);

    const existing = current.get(parsedRow.offerId);
    if (!existing) {
      results.push({
        lineNumber: parsedRow.lineNumber,
        offerId: parsedRow.offerId,
        classification: "not_found",
        reason: "Este offer_id ya no existe en el consolidado actual (fue quitado, o pertenece a otro consolidado).",
      });
      continue;
    }

    if (parsedRow.currency && parsedRow.currency !== existing.currency) {
      results.push({
        lineNumber: parsedRow.lineNumber,
        offerId: parsedRow.offerId,
        classification: "invalid",
        reason: `La moneda no se puede cambiar por CSV (actual: ${existing.currency}).`,
        productName: existing.productName,
        presentationLabel: existing.presentationLabel,
      });
      continue;
    }

    if (!isValidMoneyText(parsedRow.price)) {
      results.push({
        lineNumber: parsedRow.lineNumber,
        offerId: parsedRow.offerId,
        classification: "invalid",
        reason: "Precio inválido (usa solo dígitos y hasta 2 decimales, ej. 16.50).",
        productName: existing.productName,
        presentationLabel: existing.presentationLabel,
      });
      continue;
    }

    if (!isCampaignAvailability(parsedRow.availability)) {
      results.push({
        lineNumber: parsedRow.lineNumber,
        offerId: parsedRow.offerId,
        classification: "invalid",
        reason: "Disponibilidad inválida (usa unconfirmed, available u out_of_stock).",
        productName: existing.productName,
        presentationLabel: existing.presentationLabel,
      });
      continue;
    }

    if (parsedRow.updatedAt && existing.updatedAt && parsedRow.updatedAt !== existing.updatedAt) {
      results.push({
        lineNumber: parsedRow.lineNumber,
        offerId: parsedRow.offerId,
        classification: "stale",
        reason: "Esta oferta cambió desde que se exportó el CSV — vuelve a exportar antes de aplicar.",
        productName: existing.productName,
        presentationLabel: existing.presentationLabel,
        currentPrice: existing.priceAmount,
        currentAvailability: existing.availabilityStatus,
      });
      continue;
    }

    const newPrice = normalizeMoneyText(parsedRow.price);
    const priceChanged = newPrice !== existing.priceAmount;
    const availabilityChanged = parsedRow.availability !== existing.availabilityStatus;

    let classification: CampaignCsvRowClassification = "unchanged";
    if (priceChanged && availabilityChanged) classification = "both_changed";
    else if (priceChanged) classification = "price_changed";
    else if (availabilityChanged) classification = "availability_changed";

    results.push({
      lineNumber: parsedRow.lineNumber,
      offerId: parsedRow.offerId,
      classification,
      productName: existing.productName,
      presentationLabel: existing.presentationLabel,
      currentPrice: existing.priceAmount,
      newPrice,
      currentAvailability: existing.availabilityStatus,
      newAvailability: parsedRow.availability,
    });
  }

  return results;
}
