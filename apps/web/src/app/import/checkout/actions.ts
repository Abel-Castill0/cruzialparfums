"use server";

import { ImportOrderRepository } from "@/domains/orders/import-order-repository";
import {
  validateAndResolveImportOrder,
  type ImportOrderRequestInput,
  type ImportOrderValidationError,
} from "@/domains/orders/import-order-request";
import {
  getPersistedImportOrderSummary,
  type PersistedImportOrderSummary,
} from "@/domains/orders/import-persisted-summary";
import { readImportPublicContact } from "@/domains/import/import-public-contact";
import { checkOrderRequestRateLimit } from "@/lib/security/order-abuse";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const RATE_LIMITED_MESSAGE =
  "Recibimos varias solicitudes en poco tiempo. Espera unos minutos antes de intentarlo de nuevo.";
const ORDER_SERVICE_UNAVAILABLE_MESSAGE =
  "No pudimos procesar tu solicitud en este momento. Tu carrito se conserva.";

export type CreateImportOrderResult =
  | ({ status: "error" } & Pick<
      ImportOrderValidationError,
      "message" | "fieldErrors"
    > & { code?: "rate_limited"; retryAfterSeconds?: number })
  | {
      status: "success";
      orderNumber: string;
      whatsappUrl: string | null;
      created: boolean;
      subtotal: number;
      depositPercentage: number;
      depositAmount: number;
      campaignNumber: number;
    };

function buildImportWhatsAppMessage(summary: PersistedImportOrderSummary): string {
  const parts = [
    `Hola Cruzial Import.`,
    `Quiero continuar con mi solicitud ${summary.orderNumber}`,
    ``,
    summary.campaignNumber != null ? `Consolidado #${summary.campaignNumber}` : null,
    ``,
    ...summary.lines.map((line) => {
      return `• ${line.productNameSnapshot} — ${line.variantLabelSnapshot}\n  ${line.quantity} × S/ ${line.unitPriceAmount.toFixed(2)} = S/ ${line.lineTotalAmount.toFixed(2)}`;
    }),
    ``,
    `Subtotal: S/ ${summary.subtotalAmount.toFixed(2)}`,
    `Adelanto a coordinar (${summary.depositPercentageSnapshot}%): S/ ${summary.depositAmountSnapshot.toFixed(2)}`,
    ``,
    `Nombre: ${summary.customerSnapshot.name}`,
    `Teléfono: ${summary.customerSnapshot.phone}`,
    ``,
    `Delivery privado:`,
    `Distrito: ${summary.deliverySnapshot.district}`,
    `Dirección: ${summary.deliverySnapshot.address}`,
    ``,
    `La solicitud ya fue registrada en Cruzial.`,
  ];
  return parts.filter((p) => p !== null).join("\n");
}

function buildImportWhatsAppUrl(
  whatsappNumber: string,
  message: string,
): string {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

function importOrderErrorToMessage(error: {
  type: string;
  message?: string;
}): string {
  switch (error.type) {
    case "cart_changed":
      return "Uno o más productos cambiaron. Actualiza tu carrito antes de continuar.";
    case "campaign_unavailable":
      return "Este consolidado ya no está aceptando solicitudes.";
    case "product_unavailable":
      return "Uno o más productos ya no están disponibles.";
    case "duplicate_offer":
      return "Tu carrito contiene productos duplicados. Revisa tu selección.";
    case "deposit_policy_missing":
      return "No se encontró la política de anticipo. Contacta soporte.";
    case "deposit_policy_ambiguity":
      return "Error de configuración de anticipo. Contacta soporte.";
    case "invalid_input":
      return "Los datos enviados no son válidos. Revisa e inténtalo otra vez.";
    default:
      return "No pudimos registrar tu solicitud. Tu carrito se conserva para que puedas intentarlo nuevamente.";
  }
}

export async function createImportOrderRequest(
  input: ImportOrderRequestInput,
): Promise<CreateImportOrderResult> {
  const validated = validateAndResolveImportOrder(input);
  if ("ok" in validated)
    return {
      status: "error",
      message: validated.message,
      ...(validated.fieldErrors ? { fieldErrors: validated.fieldErrors } : {}),
    };

  const client = createSupabaseAdminClient();
  if (!client) {
    return {
      status: "error",
      message:
        "El registro de solicitudes no está disponible en este momento. Tu carrito no fue modificado.",
    };
  }

  const rateLimit = await checkOrderRequestRateLimit({
    client,
    businessUnit: "import",
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

  const persisted = await new ImportOrderRepository(client).create(validated);
  if (!persisted.ok)
    return { status: "error", message: importOrderErrorToMessage(persisted.error) };

  const summary = await getPersistedImportOrderSummary(
    client,
    persisted.data.orderId,
    validated.requestId,
  );

  if (!summary) {
    return {
      status: "success",
      orderNumber: persisted.data.orderNumber,
      whatsappUrl: null,
      created: persisted.data.created,
      subtotal: persisted.data.subtotal,
      depositPercentage: persisted.data.depositPercentage,
      depositAmount: persisted.data.depositAmount,
      campaignNumber: persisted.data.campaignNumber,
    };
  }

  const contact = await readImportPublicContact(client);

  if (!contact) {
    return {
      status: "success",
      orderNumber: summary.orderNumber,
      whatsappUrl: null,
      created: persisted.data.created,
      subtotal: summary.subtotalAmount,
      depositPercentage: summary.depositPercentageSnapshot,
      depositAmount: summary.depositAmountSnapshot,
      campaignNumber: summary.campaignNumber ?? persisted.data.campaignNumber,
    };
  }

  const message = buildImportWhatsAppMessage(summary);

  return {
    status: "success",
    orderNumber: summary.orderNumber,
    whatsappUrl: buildImportWhatsAppUrl(contact.whatsappNumber, message),
    created: persisted.data.created,
    subtotal: summary.subtotalAmount,
    depositPercentage: summary.depositPercentageSnapshot,
    depositAmount: summary.depositAmountSnapshot,
    campaignNumber: summary.campaignNumber ?? persisted.data.campaignNumber,
  };
}
