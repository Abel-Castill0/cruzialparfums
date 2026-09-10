import { isValidUuid, type FieldErrors, type ValidationResult } from "../admin-parfums/product-schema";

// Business operation is Lima, Peru — America/Lima is a fixed UTC-5 offset,
// no DST. datetime-local inputs never carry a timezone of their own (they
// resolve against the *browser's* local time otherwise), so every
// conversion here is explicit: the form always means Lima time, and the
// server always stores/reads timestamptz. Never let the browser's own
// timezone silently reinterpret a campaign window.
const LIMA_OFFSET_MINUTES = 5 * 60;

export const CAMPAIGN_STATUSES = [
  "draft",
  "scheduled",
  "open",
  "paused",
  "closed",
  "fulfilled",
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Borrador",
  scheduled: "Programado",
  open: "Abierto",
  paused: "Pausado",
  closed: "Cerrado",
  fulfilled: "Completado",
};

export function campaignStatusLabel(status: string): string {
  return isCampaignStatus(status) ? CAMPAIGN_STATUS_LABELS[status] : status;
}

export function isCampaignStatus(value: unknown): value is CampaignStatus {
  return typeof value === "string" && (CAMPAIGN_STATUSES as readonly string[]).includes(value);
}

export type CampaignFormInput = {
  number: number;
  name: string;
  opensAt: string | null;
  closesAt: string | null;
  publicMessage: string | null;
};

function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/** "YYYY-MM-DDTHH:mm" (a datetime-local value, meant as Lima wall-clock) -> UTC ISO timestamptz string. */
export function limaDatetimeLocalToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const utcMillis = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
    + LIMA_OFFSET_MINUTES * 60_000;
  const date = new Date(utcMillis);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** timestamptz ISO string -> "YYYY-MM-DDTHH:mm" Lima wall-clock, for a datetime-local defaultValue. */
export function isoToLimaDatetimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const lima = new Date(date.getTime() - LIMA_OFFSET_MINUTES * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${lima.getUTCFullYear()}-${pad(lima.getUTCMonth() + 1)}-${pad(lima.getUTCDate())}T${pad(lima.getUTCHours())}:${pad(lima.getUTCMinutes())}`;
}

export function validateCampaignForm(input: Record<string, unknown>): ValidationResult<CampaignFormInput> {
  const errors: FieldErrors = {};

  const numberRaw = typeof input.number === "string" ? input.number.trim() : "";
  const number = numberRaw === "" ? NaN : Number(numberRaw);
  if (!Number.isSafeInteger(number) || number <= 0) {
    errors.number = "El número de consolidado debe ser un entero positivo.";
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) errors.name = "El nombre es obligatorio.";
  else if (name.length > 200) errors.name = "El nombre no puede superar 200 caracteres.";

  let opensAt: string | null = null;
  const opensAtRaw = typeof input.opensAt === "string" ? input.opensAt.trim() : "";
  if (opensAtRaw) {
    opensAt = limaDatetimeLocalToIso(opensAtRaw);
    if (!opensAt) errors.opensAt = "Fecha/hora de apertura inválida.";
  }

  let closesAt: string | null = null;
  const closesAtRaw = typeof input.closesAt === "string" ? input.closesAt.trim() : "";
  if (closesAtRaw) {
    closesAt = limaDatetimeLocalToIso(closesAtRaw);
    if (!closesAt) errors.closesAt = "Fecha/hora de cierre inválida.";
  }

  if (opensAt && closesAt && !errors.opensAt && !errors.closesAt && new Date(closesAt) <= new Date(opensAt)) {
    errors.closesAt = "El cierre debe ser posterior a la apertura.";
  }

  const publicMessage = optionalText(input.publicMessage);
  if (publicMessage && publicMessage.length > 2000) {
    errors.publicMessage = "El mensaje público no puede superar 2000 caracteres.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { number, name, opensAt, closesAt, publicMessage },
  };
}

export type DuplicateCampaignFormInput = {
  newNumber: number;
  newName: string;
};

/** Validates "Duplicar consolidado": only nuevo número + nuevo nombre are
 * ever asked — status/dates/public_message/business_unit_id/currency are
 * never client input, they are fixed server-side by admin_duplicate_campaign. */
export function validateDuplicateCampaignForm(input: Record<string, unknown>): ValidationResult<DuplicateCampaignFormInput> {
  const errors: FieldErrors = {};

  const numberRaw = typeof input.newNumber === "string" ? input.newNumber.trim() : "";
  const newNumber = numberRaw === "" ? NaN : Number(numberRaw);
  if (!Number.isSafeInteger(newNumber) || newNumber <= 0) {
    errors.newNumber = "El nuevo número debe ser un entero positivo.";
  }

  const newName = typeof input.newName === "string" ? input.newName.trim() : "";
  if (!newName) errors.newName = "El nuevo nombre es obligatorio.";
  else if (newName.length > 200) errors.newName = "El nombre no puede superar 200 caracteres.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { newNumber, newName } };
}

export function isValidExpectedTimestamp(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

export { isValidUuid };
