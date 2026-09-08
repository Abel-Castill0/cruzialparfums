"use server";

import { LegacyCatalogRepository } from "@/domains/catalog/legacy-catalog-repository";
import { ParfumsOrderRepository } from "@/domains/orders/parfums-order-repository";
import {
  validateAndResolveParfumsOrder,
  type ParfumsOrderRequestInput,
  type ParfumsOrderValidationError,
} from "@/domains/orders/parfums-order-request";
import { PARFUMS_SETTINGS } from "@/domains/platform/settings";
import {
  buildPersistedOrderRequestMessage,
  buildWhatsAppUrl,
} from "@/domains/whatsapp/parfums-message-builder";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type CreateParfumsOrderResult =
  | ({ status: "error" } & Pick<ParfumsOrderValidationError, "message" | "fieldErrors">)
  | {
    status: "success";
    orderNumber: string;
    whatsappUrl: string;
    created: boolean;
  };

export async function createParfumsOrderRequest(
  input: ParfumsOrderRequestInput,
): Promise<CreateParfumsOrderResult> {
  const validated = validateAndResolveParfumsOrder(input, new LegacyCatalogRepository());
  if ("ok" in validated) return {
    status: "error",
    message: validated.message,
    ...(validated.fieldErrors ? { fieldErrors: validated.fieldErrors } : {}),
  };

  const client = createSupabaseAdminClient();
  if (!client) {
    return { status: "error", message: "El registro de solicitudes no está disponible en este momento. Tu carrito no fue modificado." };
  }

  const persisted = await new ParfumsOrderRepository(client).create(validated);
  if (!persisted.ok) return { status: "error", message: persisted.message };

  const message = buildPersistedOrderRequestMessage({
    storeName: "Cruzial Parfums",
    orderNumber: persisted.data.orderNumber,
    lines: validated.lines.map((line) => ({
      productName: line.product_name,
      variantLabel: line.variant_label,
      quantity: line.quantity,
      lineTotal: Number(line.unit_price_amount) * line.quantity,
    })),
    subtotal: validated.subtotal,
    customer: validated.customer,
  });

  return {
    status: "success",
    orderNumber: persisted.data.orderNumber,
    whatsappUrl: buildWhatsAppUrl(PARFUMS_SETTINGS.whatsappNumber, message),
    created: persisted.data.created,
  };
}
