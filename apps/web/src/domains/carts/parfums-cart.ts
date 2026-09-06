import { CART_STORAGE_KEYS } from "../platform/contracts";

export const PARFUMS_CART_UPDATED_EVENT = "cruzial:parfums-cart-updated";

export type ParfumsCartLine = {
  productId: string;
  variantId: string;
  quantity: number;
};

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "getItem" | "setItem">;

export function readParfumsCart(storage: StorageReader): ParfumsCartLine[] {
  try {
    const value: unknown = JSON.parse(
      storage.getItem(CART_STORAGE_KEYS.parfums) ?? "[]",
    );
    if (!Array.isArray(value)) return [];

    return value.filter(
      (line): line is ParfumsCartLine =>
        typeof line === "object" &&
        line !== null &&
        typeof line.productId === "string" &&
        typeof line.variantId === "string" &&
        typeof line.quantity === "number" &&
        Number.isInteger(line.quantity) &&
        line.quantity > 0,
    );
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
): ParfumsCartLine[] {
  const lines = readParfumsCart(storage);
  const existing = lines.find(
    (candidate) =>
      candidate.productId === line.productId &&
      candidate.variantId === line.variantId,
  );

  if (existing) existing.quantity += line.quantity;
  else lines.push({ ...line });

  storage.setItem(CART_STORAGE_KEYS.parfums, JSON.stringify(lines));
  return lines;
}
