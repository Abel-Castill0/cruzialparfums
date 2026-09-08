import { isProductPurchasable } from "../catalog/availability";
import { LegacyCatalogRepository } from "../catalog/legacy-catalog-repository";
import { listProductPurchaseVariants } from "../catalog/product-purchase";
import type { ParfumsCheckoutCustomer } from "../whatsapp/parfums-message-builder";

export const PARFUMS_ORDER_MAX_LINES = 40;
export const PARFUMS_ORDER_MAX_QUANTITY = 99;

export const PARFUMS_DELIVERY_OPTIONS = [
  "Lima Metropolitana — Línea 1 (delivery gratis)",
  "Lima Metropolitana — Motorizado",
  "Lima Metropolitana — Contraentrega",
  "Provincias — Agencia Shalom",
] as const;

export type ParfumsOrderRequestInput = {
  requestId: string;
  lines: Array<{ productId: string; variantId: string; quantity: number }>;
  customer: ParfumsCheckoutCustomer;
};

export type ParfumsOrderLineSnapshot = {
  legacy_product_id: string;
  legacy_variant_id: string;
  source: "assets/data.js";
  product_name: string;
  variant_label: string;
  unit_price_amount: string;
  currency: "PEN";
  quantity: number;
  variant_snapshot: {
    group: "decant" | "bottle";
    size_ml: number;
    brand: string;
    combo_contents?: string[];
  };
};

export type ValidatedParfumsOrderRequest = {
  requestId: string;
  customerSnapshot: { name: string; phone: string };
  deliverySnapshot: { district: string; delivery: string; note: string };
  shippingMethodCode: "shalom" | null;
  lines: ParfumsOrderLineSnapshot[];
  subtotal: number;
  customer: ParfumsCheckoutCustomer;
};

export type ParfumsOrderValidationError = {
  ok: false;
  message: string;
  fieldErrors?: Partial<Record<"name" | "phone" | "district" | "delivery" | "note" | "cart", string>>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max + 1) : "";
}

export function validateAndResolveParfumsOrder(
  input: unknown,
  repository = new LegacyCatalogRepository(),
): ValidatedParfumsOrderRequest | ParfumsOrderValidationError {
  if (!input || typeof input !== "object") {
    return { ok: false, message: "No pudimos leer la solicitud. Revisa los datos e inténtalo otra vez." };
  }

  const candidate = input as Partial<ParfumsOrderRequestInput>;
  if (typeof candidate.requestId !== "string" || !UUID_PATTERN.test(candidate.requestId)) {
    return { ok: false, message: "No pudimos identificar este intento. Recarga la página e inténtalo otra vez." };
  }
  if (!Array.isArray(candidate.lines) || candidate.lines.length === 0) {
    return { ok: false, message: "Tu carrito está vacío.", fieldErrors: { cart: "Añade al menos un producto." } };
  }
  if (candidate.lines.length > PARFUMS_ORDER_MAX_LINES) {
    return { ok: false, message: "Tu carrito tiene demasiadas líneas. Reduce la selección e inténtalo otra vez.", fieldErrors: { cart: `Máximo ${PARFUMS_ORDER_MAX_LINES} líneas.` } };
  }

  const customer = candidate.customer && typeof candidate.customer === "object"
    ? candidate.customer as Partial<ParfumsCheckoutCustomer>
    : {};
  const name = normalizeText(customer.name, 120);
  const phone = normalizeText(customer.phone, 30);
  const district = normalizeText(customer.district, 120);
  const delivery = normalizeText(customer.delivery, 100);
  const note = normalizeText(customer.note ?? "", 500);
  const fieldErrors: ParfumsOrderValidationError["fieldErrors"] = {};

  if (name.length < 2 || name.length > 120) fieldErrors.name = "Ingresa un nombre válido de hasta 120 caracteres.";
  const phoneDigits = phone.replace(/\D/g, "");
  if (phoneDigits.length < 9 || phoneDigits.length > 15) fieldErrors.phone = "Ingresa un número de WhatsApp válido.";
  if (district.length < 2 || district.length > 120) fieldErrors.district = "Ingresa un distrito o ciudad válido.";
  if (!(PARFUMS_DELIVERY_OPTIONS as readonly string[]).includes(delivery)) fieldErrors.delivery = "Selecciona una opción de entrega válida.";
  if (note.length > 500) fieldErrors.note = "La nota no puede superar 500 caracteres.";
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: "Revisa los campos marcados.", fieldErrors };
  }

  const snapshots: ParfumsOrderLineSnapshot[] = [];
  let subtotal = 0;
  const seen = new Set<string>();
  for (const rawLine of candidate.lines) {
    if (!rawLine || typeof rawLine !== "object") {
      return { ok: false, message: "Una línea del carrito no es válida.", fieldErrors: { cart: "Actualiza tu selección." } };
    }
    const line = rawLine as { productId?: unknown; variantId?: unknown; quantity?: unknown };
    if (typeof line.productId !== "string" || typeof line.variantId !== "string") {
      return { ok: false, message: "No pudimos identificar un producto del carrito.", fieldErrors: { cart: "Actualiza tu selección." } };
    }
    if (!Number.isSafeInteger(line.quantity) || (line.quantity as number) < 1 || (line.quantity as number) > PARFUMS_ORDER_MAX_QUANTITY) {
      return { ok: false, message: "Una cantidad del carrito no es válida.", fieldErrors: { cart: `Usa cantidades entre 1 y ${PARFUMS_ORDER_MAX_QUANTITY}.` } };
    }
    const key = `${line.productId}:${line.variantId}`;
    if (seen.has(key)) {
      return { ok: false, message: "El carrito contiene una línea duplicada.", fieldErrors: { cart: "Actualiza tu selección." } };
    }
    seen.add(key);

    const product = repository.findByLegacyId(line.productId);
    if (!product || !isProductPurchasable(product)) {
      return { ok: false, message: "Uno de los productos ya no está disponible. Actualiza tu carrito.", fieldErrors: { cart: "Retira el producto no disponible." } };
    }
    const variant = listProductPurchaseVariants(product).find((item) => item.variantId === line.variantId);
    if (!variant) {
      return { ok: false, message: "Una presentación ya no está disponible. Actualiza tu carrito.", fieldErrors: { cart: "Selecciona otra presentación." } };
    }

    const quantity = line.quantity as number;
    const lineTotal = variant.price * quantity;
    subtotal += lineTotal;
    snapshots.push({
      legacy_product_id: product.legacyId,
      legacy_variant_id: variant.variantId,
      source: "assets/data.js",
      product_name: `${product.brand} ${product.name}`.trim(),
      variant_label: product.type === "combo"
        ? `Set · ${variant.size} ml c/u`
        : variant.group === "bottle" ? `Frasco ${variant.size} ml` : `Decant ${variant.size} ml`,
      unit_price_amount: variant.price.toFixed(2),
      currency: "PEN",
      quantity,
      variant_snapshot: {
        group: variant.group,
        size_ml: variant.size,
        brand: product.brand,
        ...(product.comboContent ? { combo_contents: [...product.comboContent.perfumes] } : {}),
      },
    });
  }

  return {
    requestId: candidate.requestId,
    customerSnapshot: { name, phone },
    deliverySnapshot: { district, delivery, note },
    shippingMethodCode: delivery === "Provincias — Agencia Shalom" ? "shalom" : null,
    lines: snapshots,
    subtotal,
    customer: { name, phone, district, delivery, note },
  };
}
