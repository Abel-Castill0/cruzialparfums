"use server";

import { ImportOrderRepository } from "@/domains/orders/import-order-repository";
import {
  validateAndResolveImportOrder,
  type ImportOrderRequestInput,
  type ImportOrderValidationError,
} from "@/domains/orders/import-order-request";
import { readImportPublicContact } from "@/domains/import/import-public-contact";
import { IMPORT_SETTINGS } from "@/domains/platform/settings";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type CreateImportOrderResult =
  | ({ status: "error" } & Pick<
      ImportOrderValidationError,
      "message" | "fieldErrors"
    >)
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

function buildImportWhatsAppMessage(
  orderNumber: string,
  campaignNumber: number,
  subtotal: number,
  depositPercentage: number,
  depositAmount: number,
  customerName: string,
  customerPhone: string,
  deliveryDistrict: string,
  deliveryAddress: string,
): string {
  const parts = [
    `Hola Cruzial Import.`,
    `Quiero continuar con mi solicitud ${orderNumber}`,
    ``,
    `Consolidado #${campaignNumber}`,
    ``,
    `Subtotal: S/ ${subtotal.toFixed(2)}`,
    `Adelanto a coordinar (${depositPercentage}%): S/ ${depositAmount.toFixed(2)}`,
    ``,
    `Nombre: ${customerName}`,
    `Teléfono: ${customerPhone}`,
    ``,
    `Delivery privado:`,
    `Distrito: ${deliveryDistrict}`,
    `Dirección: ${deliveryAddress}`,
    ``,
    `La solicitud ya fue registrada en Cruzial.`,
  ];
  return parts.join("\n");
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

  const persisted = await new ImportOrderRepository(client).create(validated);
  if (!persisted.ok)
    return { status: "error", message: importOrderErrorToMessage(persisted.error) };

  const contact = await readImportPublicContact(client);
  const whatsappNumber = contact?.whatsappNumber ?? IMPORT_SETTINGS.whatsappNumber;

  const message = buildImportWhatsAppMessage(
    persisted.data.orderNumber,
    persisted.data.campaignNumber,
    persisted.data.subtotal,
    persisted.data.depositPercentage,
    persisted.data.depositAmount,
    validated.customer.name,
    validated.customer.phone,
    validated.delivery.district,
    validated.delivery.address,
  );

  return {
    status: "success",
    orderNumber: persisted.data.orderNumber,
    whatsappUrl: buildImportWhatsAppUrl(whatsappNumber, message),
    created: persisted.data.created,
    subtotal: persisted.data.subtotal,
    depositPercentage: persisted.data.depositPercentage,
    depositAmount: persisted.data.depositAmount,
    campaignNumber: persisted.data.campaignNumber,
  };
}
