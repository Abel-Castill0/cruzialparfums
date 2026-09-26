"use server";
import { wakeNotificationWorker } from "@/domains/notifications/wake";

import { validateComplaintForm, type ComplaintFormInput } from "@/domains/complaints/complaint-schema";
import { submitComplaintEntry } from "@/domains/complaints/complaint-repository";
import type { ComplaintConsumerReceipt } from "@/domains/complaints/complaint-receipt";
import { ATTEMPT_REQUIRED_CODE, resolveAttempt, rotateAttempt } from "@/lib/security/attempt-capability";
import { checkOrderRequestRateLimit } from "@/lib/security/order-abuse";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const RATE_LIMITED_MESSAGE =
  "Recibimos varias solicitudes en poco tiempo. Espera unos minutos antes de intentarlo de nuevo.";
const ATTEMPT_REQUIRED_MESSAGE =
  "Tu navegador no conservó la sesión segura del formulario. Activa las cookies para este sitio y vuelve a intentarlo; tu solicitud no se registró.";
const SERVICE_UNAVAILABLE_MESSAGE =
  "No pudimos registrar tu solicitud en este momento. Tus datos no se enviaron; intenta nuevamente.";

export type SubmitComplaintResult =
  | { status: "error"; message: string; fieldErrors?: Record<string, string>; code?: typeof ATTEMPT_REQUIRED_CODE }
  | { status: "success"; receipt: ComplaintConsumerReceipt };

/**
 * The idempotency identity is derived server-side from this browser's
 * HttpOnly attempt capability (scoped to the business unit) — never accepted
 * from the client — so a replay that returns the consumer's copy is only
 * possible from the browser that made the original submission.
 */
export async function submitComplaintAction(
  businessUnitCode: "parfums" | "import",
  formInput: Record<string, unknown>,
): Promise<SubmitComplaintResult> {
  if (businessUnitCode !== "parfums" && businessUnitCode !== "import") {
    return { status: "error", message: "Selecciona el negocio y recarga el formulario antes de enviarlo." };
  }
  const validation = validateComplaintForm(formInput);
  if (!validation.ok) {
    return { status: "error", message: "Revisa los campos marcados.", fieldErrors: validation.errors };
  }

  const attempt = await resolveAttempt("complaint", businessUnitCode);
  if (!attempt.ok) {
    return { status: "error", code: ATTEMPT_REQUIRED_CODE, message: ATTEMPT_REQUIRED_MESSAGE };
  }
  const requestId = attempt.requestId;

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

  wakeNotificationWorker();
  return { status: "success", receipt: result.data };
}

/** "Registrar otra solicitud": the next submission starts a fresh attempt.
 * Called only after the client received a resolved success. */
export async function startNewComplaintAttempt(): Promise<void> {
  await rotateAttempt("complaint");
}
