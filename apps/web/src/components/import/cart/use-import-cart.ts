"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  addImportCartLine,
  clearImportCart,
  countImportCart,
  IMPORT_CART_UPDATED_EVENT,
  reconcileImportCartForCampaign,
  readImportCart,
  removeImportCartLine,
  setImportCartLineQuantity,
  type ImportCartCampaign,
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

/** Pass `campaign` from pages that know the currently active consolidado
 * (cart, checkout) so a cart left over from a previous/different campaign is
 * reconciled (discarded, with the reason surfaced via `reconciliation`)
 * instead of silently presented as if it belonged to the new one. Pages that
 * don't know the campaign (the header badge, generic line controls) omit it
 * and get read/write access to whatever is stored without triggering a
 * reconciliation decision. */
export function useImportCart(campaign?: ImportCartCampaign | null) {
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

  const campaignId = campaign?.id ?? null;
  const campaignNumber = campaign?.number ?? null;

  useEffect(() => {
    if (campaignNumber === null) return;
    // Deferred to a microtask so the state update happens from an async
    // callback boundary (the same pattern used for the page-level campaign
    // fetch), not synchronously inside the effect body.
    queueMicrotask(() => {
      const result = reconcileImportCartForCampaign(localStorage, {
        id: campaignId,
        number: campaignNumber,
      });
      setReconciliation(result);
      if (result.status === "discarded") {
        window.dispatchEvent(new Event(IMPORT_CART_UPDATED_EVENT));
      }
    });
  }, [campaignId, campaignNumber]);

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
      apply(addImportCartLine(localStorage, line, campaign ?? null));
    },
    [apply, campaign],
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
