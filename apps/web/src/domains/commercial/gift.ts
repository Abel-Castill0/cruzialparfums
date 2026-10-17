import type { CatalogProduct } from "../catalog/types";
import { isProductPurchasable } from "../catalog/availability";

/**
 * The free 2 ml decant (docs/commercial-rules.md): the customer picks ONE Arabic perfume, and only when the order has at
 * least one full bottle. A perfume can be excluded by id (today: "Club de Nuit Precieux I"). The database repeats the
 * same checks (`attach_parfums_order_gift`), so a forged request cannot get around this module.
 */
export type GiftProblem = "no_full_bottle" | "unknown_product" | "not_arabic" | "excluded" | "unavailable";

export type GiftCheck = { ok: true; productId: string } | { ok: false; problem: GiftProblem; message: string };

const MESSAGES: Record<GiftProblem, string> = {
  no_full_bottle: "El regalo de 2 ml es solo con la compra de un frasco completo.",
  unknown_product: "El perfume de regalo ya no está disponible. Elige otro.",
  not_arabic: "El regalo de 2 ml es de un perfume árabe del catálogo. Elige otro.",
  excluded: "Este perfume no participa en el regalo. Elige otro perfume árabe.",
  unavailable: "El perfume de regalo no está disponible ahora. Elige otro.",
};

/** A full bottle of a single perfume. Sets are not bottles, and decants of any size do not count. */
export function hasFullBottle(lines: ReadonlyArray<{ product: CatalogProduct; group: "decant" | "bottle" }>): boolean {
  return lines.some((line) => line.group === "bottle" && line.product.type !== "combo");
}

/** The few fields a gift option shows; the browser only ever gets the perfume's id, brand and name. */
export type GiftCandidate = Pick<CatalogProduct, "productId" | "brand" | "name"> & { productId: string };

/**
 * The Arabic perfumes the customer may pick as the free 2 ml decant: published, purchasable, with a database id and not
 * excluded by the active rule. Built from the same catalog the server validates against, so the selector can only offer
 * perfumes `checkGiftSelection` would accept.
 */
export function listGiftCandidates(
  products: readonly CatalogProduct[],
  excludedProductIds: readonly string[] = [],
): GiftCandidate[] {
  const candidates: GiftCandidate[] = [];
  for (const product of products) {
    if (product.type !== "arab") continue;
    if (product.productId === null) continue;
    if (!isProductPurchasable(product)) continue;
    if (excludedProductIds.includes(product.productId)) continue;
    candidates.push({ productId: product.productId, brand: product.brand, name: product.name });
  }
  return candidates.sort((a, b) => `${a.brand} ${a.name}`.localeCompare(`${b.brand} ${b.name}`, "es"));
}

export function checkGiftSelection(input: {
  giftProduct: CatalogProduct | null;
  fullBottleInOrder: boolean;
  excludedProductIds: readonly string[];
}): GiftCheck {
  const fail = (problem: GiftProblem): GiftCheck => ({ ok: false, problem, message: MESSAGES[problem] });
  if (!input.fullBottleInOrder) return fail("no_full_bottle");
  const product = input.giftProduct;
  if (!product) return fail("unknown_product");
  if (product.type !== "arab") return fail("not_arabic");
  // The gift is stored as a database product id: a legacy fixture entry has none.
  if (!product.productId) return fail("unavailable");
  if (input.excludedProductIds.includes(product.productId)) return fail("excluded");
  if (!isProductPurchasable(product)) return fail("unavailable");
  return { ok: true, productId: product.productId };
}
