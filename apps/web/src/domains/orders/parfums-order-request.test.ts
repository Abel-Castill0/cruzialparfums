import { describe, expect, it } from "vitest";
import { LegacyCatalogRepository } from "../catalog/legacy-catalog-repository";
import { listProductPurchaseVariants } from "../catalog/product-purchase";
import {
  describeParfumsDelivery,
  PARFUMS_DELIVERY_OPTIONS,
  PARFUMS_MOTORIZADO_DELIVERY,
  PARFUMS_SHALOM_DELIVERY,
  shalomAgencyDelivery,
} from "./parfums-delivery";
import { validateAndResolveParfumsOrder } from "./parfums-order-request";
import { SHALOM_AGENCIES } from "./shalom-agencies";

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

describe("Parfums shipping business truth (Shalom + motorizado quoted on WhatsApp, client-confirmed)", () => {
  const withDelivery = (delivery: string) => ({ ...validInput(), customer: { ...customer, delivery } });

  it("offers exactly the two confirmed delivery methods", () => {
    expect(PARFUMS_DELIVERY_OPTIONS).toEqual([PARFUMS_SHALOM_DELIVERY, PARFUMS_MOTORIZADO_DELIVERY]);
  });

  it("never re-introduces an unconfirmed delivery method", () => {
    for (const option of PARFUMS_DELIVERY_OPTIONS) {
      expect(option.toLowerCase()).not.toMatch(/línea 1|linea 1|contraentrega|contra entrega/);
    }
  });

  it("resolves shippingMethodCode to shalom for the Shalom option", () => {
    const result = validateAndResolveParfumsOrder(validInput(), repository);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shippingMethodCode).toBe("shalom");
  });

  it("accepts a known Shalom agency and still resolves to shalom", () => {
    const agency = SHALOM_AGENCIES[0]!;
    const result = validateAndResolveParfumsOrder(withDelivery(shalomAgencyDelivery(agency)), repository);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.shippingMethodCode).toBe("shalom");
  });

  it("accepts the motorizado with no shipping method code (fee agreed on WhatsApp)", () => {
    const result = validateAndResolveParfumsOrder(withDelivery(PARFUMS_MOTORIZADO_DELIVERY), repository);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.shippingMethodCode).toBeNull();
  });

  it.each([
    "Lima Metropolitana — Motorizado",
    "Agencia Shalom: Agencia Inventada (Miraflores)",
    "Contraentrega",
  ])("rejects a delivery value we never offered: %s", (delivery) => {
    expect(validateAndResolveParfumsOrder(withDelivery(delivery), repository)).toMatchObject({ ok: false, fieldErrors: { delivery: expect.any(String) } });
  });
});

describe("describeParfumsDelivery", () => {
  it("reads the method and the chosen Shalom agency from the stored delivery text", () => {
    const agency = SHALOM_AGENCIES[0]!;
    expect(describeParfumsDelivery(shalomAgencyDelivery(agency))).toMatchObject({ method: "shalom", agency: `${agency.name} (${agency.district})` });
    expect(describeParfumsDelivery(PARFUMS_SHALOM_DELIVERY)).toMatchObject({ method: "shalom", agency: null });
    expect(describeParfumsDelivery(PARFUMS_MOTORIZADO_DELIVERY)).toMatchObject({ method: "motorizado", agency: null });
  });

  it("keeps a legacy or empty value readable without guessing a method", () => {
    expect(describeParfumsDelivery("Delivery privado")).toEqual({ method: null, methodLabel: "Delivery privado", agency: null });
    expect(describeParfumsDelivery("  ")).toMatchObject({ method: null, methodLabel: "Sin indicar" });
  });
});
