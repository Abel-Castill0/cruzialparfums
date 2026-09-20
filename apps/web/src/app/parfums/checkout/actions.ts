"use server";

import { ParfumsOrderRepository } from "@/domains/orders/parfums-order-repository";
import {
  validateAndResolveParfumsOrder,
  type ParfumsOrderRequestInput,
  type ParfumsOrderValidationError,
  type ValidatedParfumsOrderRequest,
} from "@/domains/orders/parfums-order-request";
import { PARFUMS_STORE_NAME } from "@/domains/platform/parfums-storefront";
import {
  buildPersistedOrderRequestMessage,
  buildWhatsAppUrl,
} from "@/domains/whatsapp/parfums-message-builder";
import { loadParfumsStorefront } from "@/lib/catalog/parfums-storefront";
import { checkOrderRequestRateLimit } from "@/lib/security/order-abuse";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const RATE_LIMITED_MESSAGE =
  "Recibimos varias solicitudes en poco tiempo. Espera unos minutos antes de intentarlo de nuevo.";
const ORDER_SERVICE_UNAVAILABLE_MESSAGE =
  "No pudimos procesar tu solicitud en este momento. Tu carrito se conserva.";

export type CreateParfumsOrderResult =
  | ({ status: "error" } & Pick<ParfumsOrderValidationError, "message" | "fieldErrors"> & {
        code?: "rate_limited";
        retryAfterSeconds?: number;
      })
  | {
    status: "success";
    orderNumber: string;
    whatsappUrl: string;
    created: boolean;
  };

function isOrderError(
  result: ValidatedParfumsOrderRequest | ParfumsOrderValidationError,
): result is ParfumsOrderValidationError {
  return !result.ok;
}

export async function createParfumsOrderRequest(
  input: ParfumsOrderRequestInput,
): Promise<CreateParfumsOrderResult> {
  // Server revalidation against the same published, price-confirmed catalog
  // the storefront rendered — never against client-supplied names or prices.
  const storefront = await loadParfumsStorefront();
  if (storefront.source === "unavailable") {
    return { status: "error", message: ORDER_SERVICE_UNAVAILABLE_MESSAGE };
  }
  const validated = validateAndResolveParfumsOrder(input, storefront.catalog);
  if (isOrderError(validated)) return {
    status: "error",
    message: validated.message,
    ...(validated.fieldErrors ? { fieldErrors: validated.fieldErrors } : {}),
  };

  const client = createSupabaseAdminClient();
  if (!client) {
    return { status: "error", message: "El registro de solicitudes no está disponible en este momento. Tu carrito no fue modificado." };
  }

  const rateLimit = await checkOrderRequestRateLimit({
    client,
    businessUnit: "parfums",
    requestId: validated.requestId,
    phone: validated.customer.phone,
  });

  if (rateLimit.kind === "denied") {
    return {
      status: "error",
      message: RATE_LIMITED_MESSAGE,
      code: "rate_limited",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }

  if (rateLimit.kind === "unavailable") {
    return { status: "error", message: ORDER_SERVICE_UNAVAILABLE_MESSAGE };
  }

  const persisted = await new ParfumsOrderRepository(client).create(validated);
  if (!persisted.ok) return { status: "error", message: persisted.message };

  const message = buildPersistedOrderRequestMessage({
    storeName: PARFUMS_STORE_NAME,
    orderNumber: persisted.data.orderNumber,
    lines: validated.lines.map((line) => ({
      productName: line.product_name,
      variantLabel: line.variant_label,
      quantity: line.quantity,
      lineTotal: line.unit_price_amount
        ? Number(line.unit_price_amount) * line.quantity
        : validated.subtotal / validated.lines.length,
    })),
    subtotal: validated.subtotal,
    customer: validated.customer,
  });

  return {
    status: "success",
    orderNumber: persisted.data.orderNumber,
    whatsappUrl: buildWhatsAppUrl(storefront.contact.whatsappNumber, message),
    created: persisted.data.created,
  };
}
