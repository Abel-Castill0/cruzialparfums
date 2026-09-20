import { CART_STORAGE_KEYS } from "../platform/contracts";

export const IMPORT_CART_UPDATED_EVENT = "cruzial:import-cart-updated";

export const IMPORT_CART_MAX_LINES = 40;
export const IMPORT_CART_MAX_QUANTITY = 99;

export type ImportCartLine = {
  offerId: string;
  offerUpdatedAt: string;
  label: string;
  productName: string;
  price: string;
  currency: string;
  quantity: number;
};

export type ImportCartMutation = {
  lines: ImportCartLine[];
  persisted: boolean;
};

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "getItem" | "setItem">;

function normalizeLines(value: unknown): ImportCartLine[] {
  if (!Array.isArray(value)) return [];

  const normalized: ImportCartLine[] = [];
  for (const candidate of value) {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      typeof candidate.offerId !== "string" ||
      candidate.offerId.trim() === "" ||
      typeof candidate.offerUpdatedAt !== "string" ||
      candidate.offerUpdatedAt.trim() === "" ||
      typeof candidate.label !== "string" ||
      typeof candidate.productName !== "string" ||
      typeof candidate.price !== "string" ||
      typeof candidate.currency !== "string" ||
      typeof candidate.quantity !== "number" ||
      !Number.isInteger(candidate.quantity) ||
      candidate.quantity < 1
    ) continue;

    const quantity = Math.min(candidate.quantity, IMPORT_CART_MAX_QUANTITY);
    const existing = normalized.find((line) => line.offerId === candidate.offerId);
    if (existing) existing.quantity = Math.min(existing.quantity + quantity, IMPORT_CART_MAX_QUANTITY);
    else
      normalized.push({
        offerId: candidate.offerId,
        offerUpdatedAt: candidate.offerUpdatedAt,
        label: candidate.label,
        productName: candidate.productName,
        price: candidate.price,
        currency: candidate.currency,
        quantity,
      });
  }
  return normalized;
}

export function readImportCart(storage: StorageReader): ImportCartLine[] {
  try {
    return normalizeLines(
      JSON.parse(storage.getItem(CART_STORAGE_KEYS.import) ?? "[]"),
    );
  } catch {
    return [];
  }
}

export function countImportCart(lines: readonly ImportCartLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}

export function importCartLineKey(line: { offerId: string }): string {
  return line.offerId;
}

export function addImportCartLine(
  storage: StorageWriter,
  line: ImportCartLine,
): ImportCartMutation {
  const lines = readImportCart(storage);
  const quantity = Math.min(Math.max(Math.trunc(line.quantity), 1), IMPORT_CART_MAX_QUANTITY);

  if (lines.length >= IMPORT_CART_MAX_LINES && !lines.some((l) => l.offerId === line.offerId)) {
    return { lines, persisted: false };
  }

  const existing = lines.find((candidate) => candidate.offerId === line.offerId);
  if (existing) existing.quantity = Math.min(existing.quantity + quantity, IMPORT_CART_MAX_QUANTITY);
  else lines.push({ ...line, quantity });

  return writeImportCart(storage, lines);
}

export function writeImportCart(
  storage: Pick<Storage, "setItem">,
  lines: readonly ImportCartLine[],
): ImportCartMutation {
  const normalized = normalizeLines(lines);
  try {
    storage.setItem(CART_STORAGE_KEYS.import, JSON.stringify(normalized));
    return { lines: normalized, persisted: true };
  } catch {
    return { lines: normalized, persisted: false };
  }
}

export function setImportCartLineQuantity(
  storage: StorageWriter,
  offerId: string,
  quantity: number,
): ImportCartMutation {
  const lines = readImportCart(storage);
  const next = lines
    .map((line) =>
      line.offerId === offerId
        ? { ...line, quantity: Math.min(Math.trunc(quantity), IMPORT_CART_MAX_QUANTITY) }
        : line,
    )
    .filter((line) => line.quantity > 0);
  return writeImportCart(storage, next);
}

export function removeImportCartLine(
  storage: StorageWriter,
  offerId: string,
): ImportCartMutation {
  return writeImportCart(
    storage,
    readImportCart(storage).filter((line) => line.offerId !== offerId),
  );
}

export function clearImportCart(storage: Pick<Storage, "setItem">): ImportCartMutation {
  return writeImportCart(storage, []);
}
