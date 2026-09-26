"use server";

import { validateComplaintForm, type ComplaintFormInput } from "@/domains/complaints/complaint-schema";
import { submitComplaintEntry } from "@/domains/complaints/complaint-repository";
import { checkOrderRequestRateLimit } from "@/lib/security/order-abuse";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/domains/admin-parfums/product-schema";

const RATE_LIMITED_MESSAGE =
  "Recibimos varias solicitudes en poco tiempo. Espera unos minutos antes de intentarlo de nuevo.";
const SERVICE_UNAVAILABLE_MESSAGE =
  "No pudimos registrar tu solicitud en este momento. Tus datos no se enviaron; intenta nuevamente.";

export type SubmitComplaintResult =
  | { status: "error"; message: string; fieldErrors?: Record<string, string> }
  | { status: "success"; id: string };

export async function submitComplaintAction(
  businessUnitCode: "parfums" | "import",
  requestId: string,
  formInput: Record<string, unknown>,
): Promise<SubmitComplaintResult> {
  if ((businessUnitCode !== "parfums" && businessUnitCode !== "import") || !isValidUuid(requestId)) {
    return { status: "error", message: "Selecciona el negocio y recarga el formulario antes de enviarlo." };
  }
  const validation = validateComplaintForm(formInput);
  if (!validation.ok) {
    return { status: "error", message: "Revisa los campos marcados.", fieldErrors: validation.errors };
  }

  const client = createSupabaseAdminClient();
  if (!client) {
    return { status: "error", message: SERVICE_UNAVAILABLE_MESSAGE };
  }

  const rateLimit = await checkOrderRequestRateLimit({
    client,
    purpose: "complaint",
    businessUnit: businessUnitCode,
    requestId,
    phone: validation.value.phone,
  });

  if (rateLimit.kind === "denied") {
    return { status: "error", message: RATE_LIMITED_MESSAGE };
  }
  if (rateLimit.kind === "unavailable") {
    return { status: "error", message: SERVICE_UNAVAILABLE_MESSAGE };
  }

  const result = await submitComplaintEntry(client, businessUnitCode, requestId, validation.value as ComplaintFormInput);
  if (!result.ok) {
    return { status: "error", message: SERVICE_UNAVAILABLE_MESSAGE };
  }

  return { status: "success", id: result.data.id };
}
