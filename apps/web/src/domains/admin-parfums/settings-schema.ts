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

/**
 * Typed contract for the `business_legal` setting — legal identity, RUC,
 * address, claims contact, and public policy copy. Every field is optional:
 * the business owner fills these in over time from Admin > Configuración.
 * Blank stays blank (never a fabricated RUC or legal name); the public
 * pages omit the corresponding block rather than showing an empty label.
 */
export type BusinessLegalSettingInput = {
  legalName: string;
  ruc: string;
  address: string;
  claimsEmail: string;
  claimsPhone: string;
  exchangePolicy: string;
  paymentMethodsNote: string;
};

export function validateBusinessLegalSettingForm(
  input: Record<string, unknown>,
): ValidationResult<BusinessLegalSettingInput> {
  const errors: FieldErrors = {};
  const str = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

  const legalName = str(input.legalName, 200);
  const ruc = str(input.ruc, 11);
  if (ruc.length > 0 && !/^[0-9]{11}$/.test(ruc)) {
    errors.ruc = "El RUC debe tener 11 dígitos, o déjalo en blanco.";
  }

  const address = str(input.address, 300);
  const claimsEmail = str(input.claimsEmail, 254);
  if (claimsEmail.length > 0 && !EMAIL_PATTERN.test(claimsEmail)) {
    errors.claimsEmail = "Ingresa un correo válido, o déjalo en blanco.";
  }

  const claimsPhone = str(input.claimsPhone, 40);
  const exchangePolicy = str(input.exchangePolicy, 4000);
  const paymentMethodsNote = str(input.paymentMethodsNote, 1000);

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { legalName, ruc, address, claimsEmail, claimsPhone, exchangePolicy, paymentMethodsNote },
  };
}

export { isValidExpectedTimestamp };
