"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  addImportCartLine,
  clearImportCart,
  countImportCart,
  IMPORT_CART_UPDATED_EVENT,
  reconcileImportCartForCampaign,
  reconcileImportCartForClosedCampaign,
  readImportCart,
  removeImportCartLine,
  setImportCartLineQuantity,
  type ImportCartCampaignState,
  type ImportCartLine,
  type ImportCartMutation,
  type ImportCartReconciliation,
} from "@/domains/carts/import-cart";
import { CART_STORAGE_KEYS } from "@/domains/platform/contracts";

function readSerializedCart() {
  try {
    return localStorage.getItem(CART_STORAGE_KEYS.import) ?? "[]";
  } catch {
    return "[]";
  }
}

/** Pass `campaignState` from pages that resolve the currently active
 * consolidado (cart, checkout) so a stored cart is reconciled against it:
 * - `loading` — campaign lookup still in flight. No reconciliation runs and
 *   the stored cart is left untouched; the caller must not treat this as
 *   "no active campaign" or enable an irreversible checkout submission yet.
 * - `active` — a cart from a different/legacy consolidado is discarded
 *   (surfaced via `reconciliation`); the same campaign's cart is kept.
 * - `closed` — the lookup POSITIVELY confirmed there is no active campaign
 *   (not an error). Any stored cart is cleared with no fabricated campaign
 *   identity.
 * - `error` — the lookup failed (network/backend). The stored cart is left
 *   untouched — a transient failure must never destroy it — and the caller
 *   should block checkout submission until the state is known.
 * Pages that don't resolve a campaign at all (the header badge, generic
 * line controls) omit this argument and get read/write access to whatever
 * is stored without triggering any reconciliation decision. */
export function useImportCart(campaignState?: ImportCartCampaignState) {
  const [persistenceError, setPersistenceError] = useState(false);
  const [reconciliation, setReconciliation] = useState<ImportCartReconciliation | null>(null);

  const subscribe = useCallback((onStoreChange: () => void) => {
    window.addEventListener("storage", onStoreChange);
    window.addEventListener(IMPORT_CART_UPDATED_EVENT, onStoreChange);
    return () => {
      window.removeEventListener("storage", onStoreChange);
      window.removeEventListener(IMPORT_CART_UPDATED_EVENT, onStoreChange);
    };
  }, []);

  const serialized = useSyncExternalStore(
    subscribe,
    readSerializedCart,
    () => "[]",
  );

  const status = campaignState?.status;
  const activeCampaign = campaignState?.status === "active" ? campaignState.campaign : null;
  const campaignId = activeCampaign?.id ?? null;
  const campaignNumber = activeCampaign?.number ?? null;

  useEffect(() => {
    // No opinion passed (generic consumer), still loading, or a lookup
    // error: never mutate the stored cart in any of these cases.
    if (status === undefined || status === "loading" || status === "error") return;
    // Deferred to a microtask so the state update happens from an async
    // callback boundary (the same pattern used for the page-level campaign
    // fetch), not synchronously inside the effect body.
    queueMicrotask(() => {
      const result =
        status === "active" && campaignId !== null && campaignNumber !== null
          ? reconcileImportCartForCampaign(localStorage, { id: campaignId, number: campaignNumber })
          : reconcileImportCartForClosedCampaign(localStorage);
      setReconciliation(result);
      if (result.status === "discarded" || result.status === "closed") {
        window.dispatchEvent(new Event(IMPORT_CART_UPDATED_EVENT));
      }
    });
  }, [status, campaignId, campaignNumber]);

  const lines = useMemo(
    () =>
      readImportCart({
        getItem: (key) =>
          key === CART_STORAGE_KEYS.import ? serialized : null,
      }),
    [serialized],
  );

  const totalQuantity = useMemo(() => countImportCart(lines), [lines]);

  const apply = useCallback((mutation: ImportCartMutation) => {
    setPersistenceError(!mutation.persisted);
    if (mutation.persisted) {
      window.dispatchEvent(new Event(IMPORT_CART_UPDATED_EVENT));
    }
  }, []);

  const add = useCallback(
    (line: ImportCartLine) => {
      apply(addImportCartLine(localStorage, line, activeCampaign));
    },
    [apply, activeCampaign],
  );

  const setQuantity = useCallback(
    (offerId: string, quantity: number) => {
      apply(setImportCartLineQuantity(localStorage, offerId, quantity));
    },
    [apply],
  );

  const remove = useCallback(
    (offerId: string) => {
      apply(removeImportCartLine(localStorage, offerId));
    },
    [apply],
  );

  const clear = useCallback(() => {
    apply(clearImportCart(localStorage));
  }, [apply]);

  return {
    lines,
    totalQuantity,
    persistenceError,
    reconciliation,
    add,
    setQuantity,
    remove,
    clear,
  };
}
