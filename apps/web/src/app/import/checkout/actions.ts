"use server";

import { ImportOrderRepository } from "@/domains/orders/import-order-repository";
import {
  validateAndResolveImportOrder,
  type ImportOrderRequestInput,
  type ImportOrderValidationError,
} from "@/domains/orders/import-order-request";
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
      whatsappUrl: string;
      created: boolean;
      subtotal: number;
      depositPercentage: number;
      depositAmount: number;
      campaignNumber: number;
    };

function buildImportWhatsAppUrl(
  orderNumber: string,
  campaignNumber: number,
  subtotal: number,
  depositPercentage: number,
  depositAmount: number,
  customerName: string,
  customerPhone: string,
  customerDistrict: string,
): string {
  const encoded = encodeURIComponent(
    `Hola Cruzial Import — solicitud ${orderNumber}\n` +
      `Campaña #${campaignNumber}\n` +
      `Subtotal: S/ ${subtotal.toFixed(2)}\n` +
      `Anticipo (${depositPercentage}%): S/ ${depositAmount.toFixed(2)}\n` +
      `Nombre: ${customerName}\n` +
      `Teléfono: ${customerPhone}\n` +
      `Distrito: ${customerDistrict}\n` +
      `Adjunta tu comprobante de depósito para confirmar.`,
  );
  return `https://wa.me/${IMPORT_SETTINGS.whatsappNumber}?text=${encoded}`;
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
  if (!persisted.ok) return { status: "error", message: persisted.message };

  return {
    status: "success",
    orderNumber: persisted.data.orderNumber,
    whatsappUrl: buildImportWhatsAppUrl(
      persisted.data.orderNumber,
      persisted.data.campaignNumber,
      persisted.data.subtotal,
      persisted.data.depositPercentage,
      persisted.data.depositAmount,
      validated.customer.name,
      validated.customer.phone,
      validated.customer.district,
    ),
    created: persisted.data.created,
    subtotal: persisted.data.subtotal,
    depositPercentage: persisted.data.depositPercentage,
    depositAmount: persisted.data.depositAmount,
    campaignNumber: persisted.data.campaignNumber,
  };
}
