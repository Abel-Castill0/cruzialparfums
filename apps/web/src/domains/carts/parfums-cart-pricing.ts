import { listProductPurchaseVariants } from "../catalog/product-purchase";
import type { CatalogProduct } from "../catalog/types";
import type { ParfumsCartLine } from "./parfums-cart";

export type ResolvedParfumsCartLine = {
  key: string;
  product: CatalogProduct;
  variant: ReturnType<typeof listProductPurchaseVariants>[number];
  quantity: number;
  subtotal: number;
};

export function parfumsCartLineKey(
  line: Pick<ParfumsCartLine, "productId" | "variantId">,
) {
  return `${line.productId}:${line.variantId}`;
}

export function resolveParfumsCart(
  lines: readonly ParfumsCartLine[],
  products: readonly CatalogProduct[],
): ResolvedParfumsCartLine[] {
  const byId = new Map(products.map((product) => [product.legacyId, product]));
  return lines.flatMap((line) => {
    const product = byId.get(line.productId);
    if (!product || product.discontinued) return [];
    const variant = listProductPurchaseVariants(product).find(
      (candidate) => candidate.variantId === line.variantId,
    );
    if (!variant) return [];
    return [{
      key: parfumsCartLineKey(line),
      product,
      variant,
      quantity: line.quantity,
      subtotal: variant.price * line.quantity,
    }];
  });
}

export function calculateParfumsCartTotal(
  lines: readonly ResolvedParfumsCartLine[],
) {
  return lines.reduce((total, line) => total + line.subtotal, 0);
}

export function formatParfumsVariant(
  line: Pick<ResolvedParfumsCartLine, "variant">,
) {
  return line.variant.group === "bottle"
    ? `Frasco ${line.variant.size} ml`
    : `Decant ${line.variant.size} ml`;
}
