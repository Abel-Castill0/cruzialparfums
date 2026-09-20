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
 * `id` is the immutable campaign uuid; it is `null` only for a cart whose
 * identity was never recorded (legacy/pre-Task-2 storage). `number` is
 * DISPLAY data only — never used to decide whether a cart still belongs to
 * the active campaign. */
export type ImportCartCampaign = { id: string | null; number: number };

/** The currently active consolidado, as resolved server-side. Always carries
 * a real campaign uuid — there is no "active campaign with unknown id"
 * state, so reconciliation against it never falls back to comparing the
 * display number. */
export type ActiveImportCampaign = { id: string; number: number };

/** Explicit lifecycle of the "what's the active consolidado" lookup used by
 * the cart/checkout pages. Distinguishes "still asking" and "asked and
 * failed" from "asked and there truly is none" — collapsing those into one
 * null would either destroy a cart on a transient network error, or leave a
 * closed campaign's stale cart usable at checkout. See Task-2 P1 review. */
export type ImportCartCampaignState =
  | { status: "loading" }
  | { status: "active"; campaign: ActiveImportCampaign }
  | { status: "closed" }
  | { status: "error" };

export type ImportCartMutation = {
  lines: ImportCartLine[];
  persisted: boolean;
};

export type ImportCartReconciliation =
  | { status: "empty" }
  | { status: "same_campaign"; lines: ImportCartLine[] }
  | { status: "discarded"; reason: "legacy" | "campaign_changed"; discardedLineCount: number }
  | { status: "closed"; discardedLineCount: number };

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

/** Identity comparison is UUID-only. A cart/campaign with no recorded id
 * (legacy/pre-Task-2) is never treated as matching another one merely
 * because their display numbers happen to agree — the number is not
 * authority, and a coincidental match must not carry stale commercial lines
 * forward. */
function sameCampaign(a: ImportCartCampaign, b: ImportCartCampaign): boolean {
  return a.id !== null && b.id !== null && a.id === b.id;
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
  currentCampaign: ActiveImportCampaign,
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
    reason: campaign === null || campaign.id === null ? "legacy" : "campaign_changed",
    discardedLineCount: lines.length,
  };
}

/** Reconciles a POSITIVELY CONFIRMED "no active consolidado" state — the
 * public campaign RPC succeeded and returned none, not a network/backend
 * failure. Clears any stored cart to the neutral empty/no-campaign
 * representation (never a fabricated campaign identity) so a future
 * campaign reconciles cleanly via `reconcileImportCartForCampaign` above.
 * Never call this for a transient lookup error — that must preserve the
 * cart instead (see `ImportCartCampaignState`). */
export function reconcileImportCartForClosedCampaign(
  storage: StorageWriter,
): ImportCartReconciliation {
  const { lines } = readStoredState(storage);
  writeStoredState(storage, null, []);
  if (lines.length === 0) return { status: "empty" };
  return { status: "closed", discardedLineCount: lines.length };
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
