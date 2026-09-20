"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import {
  clearParfumsCart,
  PARFUMS_CART_UPDATED_EVENT,
  readParfumsCart,
  removeParfumsCartLine,
  setParfumsCartLineQuantity,
  type ParfumsCartMutation,
} from "@/domains/carts/parfums-cart";
import {
  calculateParfumsCartTotal,
  resolveParfumsCart,
} from "@/domains/carts/parfums-cart-pricing";
import type { CatalogProduct } from "@/domains/catalog/types";
import { CART_STORAGE_KEYS } from "@/domains/platform/contracts";

function readSerializedCart() {
  try {
    return localStorage.getItem(CART_STORAGE_KEYS.parfums) ?? "[]";
  } catch {
    return "[]";
  }
}

export function useParfumsCart(products: readonly CatalogProduct[]) {
  const [persistenceError, setPersistenceError] = useState(false);

  const subscribe = useCallback((onStoreChange: () => void) => {
    window.addEventListener("storage", onStoreChange);
    window.addEventListener(PARFUMS_CART_UPDATED_EVENT, onStoreChange);
    return () => {
      window.removeEventListener("storage", onStoreChange);
      window.removeEventListener(PARFUMS_CART_UPDATED_EVENT, onStoreChange);
    };
  }, []);
  const serialized = useSyncExternalStore(
    subscribe,
    readSerializedCart,
    () => "[]",
  );
  const storedLines = useMemo(() => readParfumsCart({
    getItem: (key) => key === CART_STORAGE_KEYS.parfums ? serialized : null,
  }), [serialized]);

  const lines = useMemo(
    () => resolveParfumsCart(storedLines, products),
    [products, storedLines],
  );
  const total = useMemo(() => calculateParfumsCartTotal(lines), [lines]);

  const apply = useCallback((mutation: ParfumsCartMutation) => {
    setPersistenceError(!mutation.persisted);
    if (mutation.persisted) {
      window.dispatchEvent(new Event(PARFUMS_CART_UPDATED_EVENT));
    }
  }, []);

  const setQuantity = useCallback((productId: string, variantId: string, quantity: number) => {
    apply(setParfumsCartLineQuantity(localStorage, productId, variantId, quantity));
  }, [apply]);

  const remove = useCallback((productId: string, variantId: string) => {
    apply(removeParfumsCartLine(localStorage, productId, variantId));
  }, [apply]);

  const clear = useCallback(() => {
    apply(clearParfumsCart(localStorage));
  }, [apply]);

  return { lines, total, persistenceError, setQuantity, remove, clear };
}
