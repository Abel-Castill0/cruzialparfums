"use server";
import { wakeNotificationWorker } from "@/domains/notifications/wake";

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
import { ATTEMPT_REQUIRED_CODE, resolveAttempt, rotateAttempt } from "@/lib/security/attempt-capability";
import { checkOrderRequestRateLimit } from "@/lib/security/order-abuse";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const RATE_LIMITED_MESSAGE =
  "Recibimos varias solicitudes en poco tiempo. Espera unos minutos antes de intentarlo de nuevo.";
const ATTEMPT_REQUIRED_MESSAGE =
  "Tu navegador no conservó la sesión de compra segura. Activa las cookies para este sitio y vuelve a intentarlo; no registramos ninguna solicitud.";
const ORDER_SERVICE_UNAVAILABLE_MESSAGE =
  "No pudimos procesar tu solicitud en este momento. Tu carrito se conserva.";

export type CreateImportOrderResult =
  | ({ status: "error" } & Pick<
      ImportOrderValidationError,
      "message" | "fieldErrors"
    > & { code?: "rate_limited" | typeof ATTEMPT_REQUIRED_CODE; retryAfterSeconds?: number })
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
    case "customer_conflict_unresolved":
      return "No pudimos verificar tu contacto por un conflicto inesperado. Contacta soporte antes de reintentar.";
    case "invalid_input":
      return "Los datos enviados no son válidos. Revisa e inténtalo otra vez.";
    default:
      return "No pudimos registrar tu solicitud. Tu carrito se conserva para que puedas intentarlo nuevamente.";
  }
}

/** Public input: everything but the idempotency identity, which the server
 * derives from this browser's HttpOnly attempt capability. */
export type ImportOrderSubmission = Omit<ImportOrderRequestInput, "requestId">;

export async function createImportOrderRequest(
  submission: ImportOrderSubmission,
): Promise<CreateImportOrderResult> {
  const attempt = await resolveAttempt("import-order", "import");
  if (!attempt.ok) {
    return { status: "error", code: ATTEMPT_REQUIRED_CODE, message: ATTEMPT_REQUIRED_MESSAGE };
  }
  // Any client-supplied requestId is overwritten: only the capability holder
  // can reproduce this id, so only they can have an existing order replayed.
  const validated = validateAndResolveImportOrder({
    ...(submission as object),
    requestId: attempt.requestId,
  } as ImportOrderRequestInput);
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
    purpose: "order_request",
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
  wakeNotificationWorker();

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

/** Starts a fresh attempt for the next request. The client calls this only
 * after it has actually received a resolved success. */
export async function startNewImportCheckoutAttempt(): Promise<void> {
  await rotateAttempt("import-order");
}
