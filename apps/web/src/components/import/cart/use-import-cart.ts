"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import {
  addImportCartLine,
  clearImportCart,
  countImportCart,
  IMPORT_CART_UPDATED_EVENT,
  readImportCart,
  removeImportCartLine,
  setImportCartLineQuantity,
  type ImportCartLine,
  type ImportCartMutation,
} from "@/domains/carts/import-cart";
import { CART_STORAGE_KEYS } from "@/domains/platform/contracts";

function readSerializedCart() {
  try {
    return localStorage.getItem(CART_STORAGE_KEYS.import) ?? "[]";
  } catch {
    return "[]";
  }
}

export function useImportCart() {
  const [persistenceError, setPersistenceError] = useState(false);

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
      apply(addImportCartLine(localStorage, line));
    },
    [apply],
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
    add,
    setQuantity,
    remove,
    clear,
  };
}
