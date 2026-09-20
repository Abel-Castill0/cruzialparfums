import { CART_STORAGE_KEYS } from "../platform/contracts";

export const IMPORT_CART_UPDATED_EVENT = "cruzial:import-cart-updated";

export const IMPORT_CART_MAX_LINES = 40;
export const IMPORT_CART_MAX_QUANTITY = 99;
const CART_SCHEMA_VERSION = 2;

export type ImportCartLine = {
  offerId: string;
  offerUpdatedAt: string;
  label: string;
  productName: string;
  price: string;
  currency: string;
  quantity: number;
};

/** The authoritative identity of the consolidado a stored cart belongs to.
 * `id` is the immutable campaign uuid when the caller has it (public product
 * pages resolve it server-side); `number` is the display fallback used only
 * when an id was never available for either side of the comparison. Never
 * compare by number alone when both sides have an id. */
export type ImportCartCampaign = { id: string | null; number: number };

export type ImportCartMutation = {
  lines: ImportCartLine[];
  persisted: boolean;
};

export type ImportCartReconciliation =
  | { status: "empty" }
  | { status: "same_campaign"; lines: ImportCartLine[] }
  | { status: "discarded"; reason: "legacy" | "campaign_changed"; discardedLineCount: number };

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "getItem" | "setItem">;

type StoredCartState = { lines: ImportCartLine[]; campaign: ImportCartCampaign | null };

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

function normalizeCampaign(value: unknown): ImportCartCampaign | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.number !== "number" ||
    !Number.isInteger(candidate.number) ||
    candidate.number <= 0
  )
    return null;
  const id = typeof candidate.id === "string" && candidate.id.trim() !== "" ? candidate.id : null;
  return { id, number: candidate.number };
}

/** Reads the raw stored state, distinguishing:
 * - no/empty storage -> {lines: [], campaign: null}
 * - legacy bare-array format (pre-Task-2 carts) -> lines kept, campaign null
 *   (identity unknown — was never recorded)
 * - malformed/corrupted JSON or unexpected shape -> {lines: [], campaign: null}
 * - current versioned envelope -> lines + the campaign it was stamped with */
function readStoredState(storage: StorageReader): StoredCartState {
  let raw: string | null;
  try {
    raw = storage.getItem(CART_STORAGE_KEYS.import);
  } catch {
    return { lines: [], campaign: null };
  }
  if (!raw) return { lines: [], campaign: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { lines: [], campaign: null };
  }

  if (Array.isArray(parsed)) {
    return { lines: normalizeLines(parsed), campaign: null };
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    (parsed as Record<string, unknown>).v === CART_SCHEMA_VERSION
  ) {
    const record = parsed as Record<string, unknown>;
    return { lines: normalizeLines(record.lines), campaign: normalizeCampaign(record.campaign) };
  }
  return { lines: [], campaign: null };
}

function writeStoredState(
  storage: Pick<Storage, "setItem">,
  campaign: ImportCartCampaign | null,
  lines: readonly ImportCartLine[],
): ImportCartMutation {
  const normalized = normalizeLines(lines);
  try {
    storage.setItem(
      CART_STORAGE_KEYS.import,
      JSON.stringify({ v: CART_SCHEMA_VERSION, campaign, lines: normalized }),
    );
    return { lines: normalized, persisted: true };
  } catch {
    return { lines: normalized, persisted: false };
  }
}

function sameCampaign(a: ImportCartCampaign, b: ImportCartCampaign): boolean {
  if (a.id !== null && b.id !== null) return a.id === b.id;
  return a.number === b.number;
}

export function readImportCart(storage: StorageReader): ImportCartLine[] {
  return readStoredState(storage).lines;
}

/** The campaign identity the currently stored cart claims to belong to, or
 * null when unknown (empty storage, legacy format, or malformed data). */
export function readImportCartCampaign(storage: StorageReader): ImportCartCampaign | null {
  return readStoredState(storage).campaign;
}

export function countImportCart(lines: readonly ImportCartLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}

export function importCartLineKey(line: { offerId: string }): string {
  return line.offerId;
}

/** Compares the stored cart's campaign identity against the currently active
 * one. A cart from a different (or unverifiable/legacy) consolidado is
 * discarded rather than silently carried forward — never a partial/implicit
 * substitution of prices or offers. Safe to call every time the active
 * campaign becomes known (product page, cart page, checkout page); it is a
 * no-op when the cart already belongs to that campaign. */
export function reconcileImportCartForCampaign(
  storage: StorageWriter,
  currentCampaign: ImportCartCampaign,
): ImportCartReconciliation {
  const { lines, campaign } = readStoredState(storage);
  if (lines.length === 0) {
    writeStoredState(storage, currentCampaign, []);
    return { status: "empty" };
  }
  if (campaign !== null && sameCampaign(campaign, currentCampaign)) {
    return { status: "same_campaign", lines };
  }
  writeStoredState(storage, currentCampaign, []);
  return {
    status: "discarded",
    reason: campaign === null ? "legacy" : "campaign_changed",
    discardedLineCount: lines.length,
  };
}

/** Adds a line to the cart. When `campaign` is supplied (the caller knows
 * the currently active consolidado — e.g. a product page), a stored cart
 * belonging to a different campaign is discarded first, so the new line
 * never lands mixed in with a stale consolidado's prices/offers. When
 * `campaign` is omitted, the existing stored campaign stamp (if any) is
 * preserved unchanged — used by contexts that don't resolve campaign
 * identity themselves (e.g. generic mutation helpers). */
export function addImportCartLine(
  storage: StorageWriter,
  line: ImportCartLine,
  campaign: ImportCartCampaign | null = null,
): ImportCartMutation {
  const stored = readStoredState(storage);
  const startingLines =
    campaign && (stored.campaign === null || !sameCampaign(stored.campaign, campaign))
      ? []
      : stored.lines;
  const stampCampaign = campaign ?? stored.campaign;

  const quantity = Math.min(Math.max(Math.trunc(line.quantity), 1), IMPORT_CART_MAX_QUANTITY);
  const lines = [...startingLines];

  if (lines.length >= IMPORT_CART_MAX_LINES && !lines.some((l) => l.offerId === line.offerId)) {
    return { lines, persisted: false };
  }

  const existing = lines.find((candidate) => candidate.offerId === line.offerId);
  if (existing) existing.quantity = Math.min(existing.quantity + quantity, IMPORT_CART_MAX_QUANTITY);
  else lines.push({ ...line, quantity });

  return writeStoredState(storage, stampCampaign, lines);
}

export function writeImportCart(
  storage: StorageWriter,
  lines: readonly ImportCartLine[],
): ImportCartMutation {
  const { campaign } = readStoredState(storage);
  return writeStoredState(storage, campaign, lines);
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

export function clearImportCart(storage: StorageWriter): ImportCartMutation {
  return writeImportCart(storage, []);
}
