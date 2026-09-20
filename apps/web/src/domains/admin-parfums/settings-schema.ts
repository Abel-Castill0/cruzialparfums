import type { FieldErrors, ValidationResult } from "./product-schema";
import { isValidExpectedTimestamp } from "./category-schema";

/**
 * Typed contract for the `public_contact` setting (Phase 4G1). Deliberately
 * not a generic JSON editor — these are the only three fields the brief
 * confirms, matching supabase/migrations/20260908170000_admin_settings_public_contact.sql
 * (app.validate_settings_value re-checks the same shape at the database
 * layer; this is the client/server-action-facing copy of that contract).
 */
export type PublicContactSettingInput = {
  whatsappNumber: string;
  whatsappDisplay: string;
  contactEmail: string;
};

const WHATSAPP_NUMBER_PATTERN = /^[1-9][0-9]{7,14}$/;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function validatePublicContactSettingForm(
  input: Record<string, unknown>,
): ValidationResult<PublicContactSettingInput> {
  const errors: FieldErrors = {};

  const whatsappNumber = typeof input.whatsappNumber === "string" ? input.whatsappNumber.trim() : "";
  if (!WHATSAPP_NUMBER_PATTERN.test(whatsappNumber)) {
    errors.whatsappNumber = "Ingresa el número en formato E.164 sin '+' (ej. 51926390591).";
  }

  const whatsappDisplay = typeof input.whatsappDisplay === "string" ? input.whatsappDisplay.trim() : "";
  if (whatsappDisplay.length < 1 || whatsappDisplay.length > 40) {
    errors.whatsappDisplay = "Ingresa cómo se muestra el número (1-40 caracteres).";
  }

  const contactEmail = typeof input.contactEmail === "string" ? input.contactEmail.trim() : "";
  if (!EMAIL_PATTERN.test(contactEmail) || contactEmail.length > 254) {
    errors.contactEmail = "Ingresa un correo de contacto válido.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { whatsappNumber, whatsappDisplay, contactEmail } };
}

export { isValidExpectedTimestamp };
