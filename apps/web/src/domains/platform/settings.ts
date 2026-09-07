import type { BusinessUnitCode } from "./contracts";

/**
 * Client-confirmed 2026-09-07 (docs/client-decisions.md): new public
 * contact channels. LATEST wins over anything shown before this date.
 *
 * Parfums and Import get their own settings object each — per the brief,
 * "deben tener settings separados aunque inicialmente usen el mismo
 * número". Both currently read the same underlying values, defined once
 * here, so nothing hardcodes the phone/email string a second time; when
 * Import gets its own confirmed number later, only IMPORT_SETTINGS changes.
 */

const CRUZIAL_WHATSAPP_E164 = "51926390591";
const CRUZIAL_WHATSAPP_DISPLAY = "926 390 591";
const CRUZIAL_CONTACT_EMAIL = "dominiocruzial@gmail.com";

export type BusinessUnitSettings = {
  whatsappNumber: string;
  whatsappDisplay: string;
  contactEmail: string;
};

export const PARFUMS_SETTINGS: BusinessUnitSettings = {
  whatsappNumber: CRUZIAL_WHATSAPP_E164,
  whatsappDisplay: CRUZIAL_WHATSAPP_DISPLAY,
  contactEmail: CRUZIAL_CONTACT_EMAIL,
};

export const IMPORT_SETTINGS: BusinessUnitSettings = {
  whatsappNumber: CRUZIAL_WHATSAPP_E164,
  whatsappDisplay: CRUZIAL_WHATSAPP_DISPLAY,
  contactEmail: CRUZIAL_CONTACT_EMAIL,
};

export function getBusinessUnitSettings(
  unit: BusinessUnitCode,
): BusinessUnitSettings {
  return unit === "import" ? IMPORT_SETTINGS : PARFUMS_SETTINGS;
}
