import { describe, expect, it } from "vitest";
import { LegacyCatalogRepository } from "../catalog/legacy-catalog-repository";
import { listProductPurchaseVariants } from "../catalog/product-purchase";
import { PARFUMS_DELIVERY_OPTIONS, validateAndResolveParfumsOrder } from "./parfums-order-request";

const repository = new LegacyCatalogRepository();
const product = repository.list().find((item) => item.availabilityStatus === "available" && listProductPurchaseVariants(item).length > 0)!;
const variant = listProductPurchaseVariants(product)[0]!;
const requestId = "12345678-1234-4123-8123-123456789abc";
const customer = {
  name: "Ana Pérez",
  phone: "999 111 222",
  district: "Miraflores, Lima",
  delivery: "Agencia Shalom (Lima y todo el Perú)",
  note: "Tarde",
};

function validInput() {
  return { requestId, lines: [{ productId: product.legacyId!, variantId: variant.variantId, quantity: 2 }], customer };
}

describe("Parfums public order revalidation", () => {
  it("rebuilds snapshots and subtotal from the repository", () => {
    const result = validateAndResolveParfumsOrder(validInput(), repository);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines.at(0)).toMatchObject({
      legacy_product_id: product.legacyId,
      legacy_variant_id: variant.variantId,
      unit_price_amount: variant.price.toFixed(2),
      quantity: 2,
    });
    expect(result.subtotal).toBe(variant.price * 2);
  });

  it("ignores forged browser commercial fields", () => {
    const input = { ...validInput(), subtotal: 0, lines: [{ ...validInput().lines[0], unit_price: 0, line_total: 0, product_name: "Forged" }] };
    const result = validateAndResolveParfumsOrder(input, repository);
    if (!result.ok) throw new Error(result.message);
    expect(result.lines.at(0)?.unit_price_amount).toBe(variant.price.toFixed(2));
    expect(result.lines.at(0)?.product_name).not.toBe("Forged");
    expect(result.subtotal).toBe(variant.price * 2);
  });

  it.each([
    ["unknown product", { ...validInput(), lines: [{ productId: "missing", variantId: variant.variantId, quantity: 1 }] }],
    ["unknown variant", { ...validInput(), lines: [{ productId: product.legacyId, variantId: "missing", quantity: 1 }] }],
    ["zero quantity", { ...validInput(), lines: [{ productId: product.legacyId, variantId: variant.variantId, quantity: 0 }] }],
    ["absurd quantity", { ...validInput(), lines: [{ productId: product.legacyId, variantId: variant.variantId, quantity: 100 }] }],
    ["empty cart", { ...validInput(), lines: [] }],
  ])("rejects %s", (_name, input) => {
    expect(validateAndResolveParfumsOrder(input, repository)).toMatchObject({ ok: false });
  });

  it("rejects a hidden product through the public repository contract", () => {
    expect(validateAndResolveParfumsOrder({ ...validInput(), lines: [{ productId: "bir-intense", variantId: "decant-3ml", quantity: 1 }] }, repository)).toMatchObject({ ok: false });
  });
});

describe("Parfums shipping business truth (Shalom only, client-confirmed)", () => {
  it("offers exactly one confirmed delivery method: Shalom", () => {
    expect(PARFUMS_DELIVERY_OPTIONS).toHaveLength(1);
    expect(PARFUMS_DELIVERY_OPTIONS[0]).toMatch(/shalom/i);
  });

  it("never re-introduces an unconfirmed delivery method", () => {
    for (const option of PARFUMS_DELIVERY_OPTIONS) {
      expect(option.toLowerCase()).not.toMatch(/línea 1|linea 1|motoriz|contraentrega|contra entrega/);
    }
  });

  it("resolves shippingMethodCode to shalom for the only confirmed option", () => {
    const result = validateAndResolveParfumsOrder(validInput(), repository);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shippingMethodCode).toBe("shalom");
  });

  it("rejects an unconfirmed delivery method even if forged by the client", () => {
    const input = { ...validInput(), customer: { ...customer, delivery: "Lima Metropolitana — Motorizado" } };
    expect(validateAndResolveParfumsOrder(input, repository)).toMatchObject({ ok: false, fieldErrors: { delivery: expect.any(String) } });
  });
});
