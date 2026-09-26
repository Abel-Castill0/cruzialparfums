export const PARFUMS_ORDER_HANDOFF_PREFIX = "cruzial:parfums-order-handoff:";

export function handoffStorageKey(orderNumber: string) {
  return `${PARFUMS_ORDER_HANDOFF_PREFIX}${orderNumber}`;
}

export function shouldClearCartAfterOrder(status: "success" | "error") {
  return status === "success";
}
