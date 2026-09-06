import { CART_STORAGE_KEYS } from "../platform/contracts";

export const PARFUMS_CART_UPDATED_EVENT = "cruzial:parfums-cart-updated";

export type ParfumsCartLine = {
  productId: string;
  variantId: string;
  quantity: number;
};

export type ParfumsCartMutation = {
  lines: ParfumsCartLine[];
  persisted: boolean;
};

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "getItem" | "setItem">;

function normalizeLines(value: unknown): ParfumsCartLine[] {
  if (!Array.isArray(value)) return [];

  const normalized: ParfumsCartLine[] = [];
  for (const candidate of value) {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      typeof candidate.productId !== "string" ||
      candidate.productId.trim() === "" ||
      typeof candidate.variantId !== "string" ||
      candidate.variantId.trim() === "" ||
      typeof candidate.quantity !== "number" ||
      !Number.isInteger(candidate.quantity) ||
      candidate.quantity < 1
    ) continue;

    const quantity = Math.min(candidate.quantity, 99);
    const existing = normalized.find(
      (line) =>
        line.productId === candidate.productId &&
        line.variantId === candidate.variantId,
    );
    if (existing) existing.quantity = Math.min(existing.quantity + quantity, 99);
    else normalized.push({
      productId: candidate.productId,
      variantId: candidate.variantId,
      quantity,
    });
  }
  return normalized;
}

export function readParfumsCart(storage: StorageReader): ParfumsCartLine[] {
  try {
    return normalizeLines(JSON.parse(
      storage.getItem(CART_STORAGE_KEYS.parfums) ?? "[]",
    ));
  } catch {
    return [];
  }
}

export function countParfumsCart(lines: readonly ParfumsCartLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}

export function addParfumsCartLine(
  storage: StorageWriter,
  line: ParfumsCartLine,
): ParfumsCartMutation {
  const lines = readParfumsCart(storage);
  const quantity = Math.min(Math.max(Math.trunc(line.quantity), 1), 99);
  const existing = lines.find(
    (candidate) =>
      candidate.productId === line.productId &&
      candidate.variantId === line.variantId,
  );

  if (existing) existing.quantity = Math.min(existing.quantity + quantity, 99);
  else lines.push({ ...line, quantity });

  return writeParfumsCart(storage, lines);
}

export function writeParfumsCart(
  storage: Pick<Storage, "setItem">,
  lines: readonly ParfumsCartLine[],
): ParfumsCartMutation {
  const normalized = normalizeLines(lines);
  try {
    storage.setItem(CART_STORAGE_KEYS.parfums, JSON.stringify(normalized));
    return { lines: normalized, persisted: true };
  } catch {
    return { lines: normalized, persisted: false };
  }
}

export function setParfumsCartLineQuantity(
  storage: StorageWriter,
  productId: string,
  variantId: string,
  quantity: number,
): ParfumsCartMutation {
  const lines = readParfumsCart(storage);
  const next = lines
    .map((line) => line.productId === productId && line.variantId === variantId
      ? { ...line, quantity: Math.min(Math.trunc(quantity), 99) }
      : line)
    .filter((line) => line.quantity > 0);
  return writeParfumsCart(storage, next);
}

export function removeParfumsCartLine(
  storage: StorageWriter,
  productId: string,
  variantId: string,
): ParfumsCartMutation {
  return writeParfumsCart(
    storage,
    readParfumsCart(storage).filter(
      (line) => line.productId !== productId || line.variantId !== variantId,
    ),
  );
}

export function clearParfumsCart(
  storage: Pick<Storage, "setItem">,
): ParfumsCartMutation {
  return writeParfumsCart(storage, []);
}
