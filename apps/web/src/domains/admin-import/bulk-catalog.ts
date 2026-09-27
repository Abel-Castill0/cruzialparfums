import { csvSyntaxMessage, parseCsv, spreadsheetSafeText } from "./campaign-csv";
import { isValidUuid } from "@/domains/admin-parfums/product-schema";

export const BULK_COLUMNS = ["kind", "id", "updated_at", "name", "brand", "category_id", "label", "presentation_class", "capacity_ml"] as const;
export type BulkCatalogRow = Record<typeof BULK_COLUMNS[number], string>;
export type BulkIssue = { line: number; reason: string };
export type BulkParseResult = { rows: BulkCatalogRow[]; issues: BulkIssue[] };
export function parseBulkCatalog(text: string): BulkParseResult {
 const issues: BulkIssue[] = []; const rows: BulkCatalogRow[] = [];
 if (new TextEncoder().encode(text).length > 2 * 1024 * 1024) return { rows, issues: [{ line: 1, reason: "Máximo 2 MiB." }] };
 const lexed = parseCsv(text);
 if (!lexed.ok) return { rows, issues: [{ line: lexed.line, reason: csvSyntaxMessage(lexed) }] };
 const csv = lexed.rows; const header = csv[0]?.map(x => x.trim().toLowerCase()) ?? [];
 if (header.length !== BULK_COLUMNS.length || new Set(header).size !== header.length || BULK_COLUMNS.some(x => !header.includes(x)))
  return { rows, issues: [{ line: 1, reason: "Usa las columnas de la plantilla exportada." }] };
 if (csv.length < 2 || csv.length > 2001) return { rows, issues: [{ line: 1, reason: "Incluye de 1 a 2000 filas." }] };
 const seen = new Set<string>();
 csv.slice(1).forEach((cells, i) => {
  const row = Object.fromEntries(BULK_COLUMNS.map(key => [key, (cells[header.indexOf(key)] ?? "").trim()])) as BulkCatalogRow;
  const fail = (reason: string) => issues.push({ line: i + 2, reason });
  if (cells.length !== header.length) return fail("Número de columnas inválido.");
  if (!isValidUuid(row.id) || !/^\d{4}-\d{2}-\d{2}T/.test(row.updated_at) || !Number.isFinite(Date.parse(row.updated_at))) return fail("Identidad o versión inválida.");
  const identity = `${row.kind}:${row.id}`;
  if (seen.has(identity)) return fail("Identidad duplicada."); seen.add(identity);
  if (row.kind === "product") {
   if (!row.name || row.name.length > 180 || row.brand.length > 120 || (row.category_id && !isValidUuid(row.category_id))) return fail("Nombre, marca o categoría inválidos.");
   if (row.label || row.presentation_class || row.capacity_ml) return fail("Una fila de producto no edita presentación.");
  } else if (row.kind === "presentation") {
   if (!row.label || row.label.length > 180 || !["single_fixed", "multi_presentation", "pack_set", "ambiguous"].includes(row.presentation_class)) return fail("Presentación inválida.");
   if (row.capacity_ml && (!/^\d+(?:\.\d{1,3})?$/.test(row.capacity_ml) || Number(row.capacity_ml) <= 0 || Number(row.capacity_ml) > 100000)) return fail("Capacidad inválida.");
   if (row.name || row.brand || row.category_id) return fail("Una fila de presentación no edita producto.");
  } else return fail("kind debe ser product o presentation.");
  rows.push(row);
 });
 return { rows, issues };
}
export function exportBulkCatalog(rows: BulkCatalogRow[]): string {
 const escape = (v: string) => `"${spreadsheetSafeText(v).replaceAll('"', '""')}"`;
 return [BULK_COLUMNS.join(","), ...rows.map(row => BULK_COLUMNS.map(key => escape(row[key])).join(","))].join("\r\n");
}
export type MediaIdentity = { id: string; slug: string; name: string };
export type MediaMatch = { filename: string; productId: string | null; reason: string | null };
/** Exact filename stem -> canonical slug, or explicit filename -> product UUID manifest. */
export function matchMediaFiles(filenames: string[], products: MediaIdentity[], manifestText = ""): MediaMatch[] {
 const manifest = new Map<string, string>(); const duplicates = new Set<string>();
 if (manifestText) {
  if (new TextEncoder().encode(manifestText).length > 2 * 1024 * 1024) return filenames.map(filename => ({ filename, productId: null, reason: "Manifiesto supera 2 MiB." }));
  const lexed = parseCsv(manifestText);
  if (!lexed.ok) return filenames.map(filename => ({ filename, productId: null, reason: `Manifiesto: ${csvSyntaxMessage(lexed)}` }));
  const csv = lexed.rows;
  if (csv[0]?.join(",") !== "filename,product_id") return filenames.map(filename => ({ filename, productId: null, reason: "Manifiesto: filename,product_id." }));
  for (const row of csv.slice(1)) {
   const file = row[0]?.trim() ?? "";
   if (manifest.has(file) || row.length !== 2) duplicates.add(file);
   manifest.set(file, row[1]?.trim() ?? "");
  }
 }
 const seenProducts = new Set<string>(); const seenFiles = new Set<string>();
 return filenames.map(filename => {
  const fail = (reason: string): MediaMatch => ({ filename, productId: null, reason });
  if (seenFiles.has(filename) || duplicates.has(filename)) return fail("Archivo ambiguo o duplicado."); seenFiles.add(filename);
  if (!/\.(png|jpe?g|webp)$/i.test(filename)) return fail("Usa PNG, JPG o WebP.");
  const candidates = manifestText ? products.filter(p => p.id === manifest.get(filename)) : products.filter(p => p.slug === filename.replace(/\.[^.]+$/, ""));
  if (candidates.length !== 1) return fail(candidates.length ? "Identidad ambigua." : "Sin coincidencia exacta.");
  const productId = candidates[0]!.id;
  if (seenProducts.has(productId)) return fail("Solo una imagen principal por producto en el lote."); seenProducts.add(productId);
  return { filename, productId, reason: null };
 });
}

