import { isValidExpectedTimestamp } from "../admin-parfums/category-schema";
import { isValidUuid, type FieldErrors, type ValidationResult } from "../admin-parfums/product-schema";

/**
 * Admin form validation for the commercial-rule tables (docs/commercial-rules.md). The database repeats every check
 * (CHECK constraints and the `promotion_rules` shape trigger); these messages are what the operator reads first.
 */
export { isValidExpectedTimestamp, isValidUuid };

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max + 1) : "";
}

export type DeliveryZoneForm = { district: string; isRestricted: boolean };

export function validateDeliveryZoneForm(input: { district: unknown; isRestricted: unknown }): ValidationResult<DeliveryZoneForm> {
  const errors: FieldErrors = {};
  const district = text(input.district, 80);
  if (district.length < 2 || district.length > 80) errors.district = "Escribe el nombre del distrito (2 a 80 caracteres).";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { district, isRestricted: input.isRestricted === true } };
}

export type ShippingAgencyForm = { name: string; coverage: string; description: string; isActive: boolean };

export function validateShippingAgencyForm(input: { name: unknown; coverage: unknown; description: unknown; isActive: unknown }): ValidationResult<ShippingAgencyForm> {
  const errors: FieldErrors = {};
  const name = text(input.name, 80);
  const coverage = text(input.coverage, 120);
  const description = text(input.description, 240);
  if (name.length < 1 || name.length > 80) errors.name = "Escribe el nombre de la agencia (hasta 80 caracteres).";
  if (coverage.length < 1 || coverage.length > 120) errors.coverage = "Escribe la cobertura (hasta 120 caracteres).";
  if (description.length > 240) errors.description = "La descripción admite hasta 240 caracteres.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, coverage, description, isActive: input.isActive === true } };
}

export type MixedWholesaleForm = {
  minUnits: number;
  discounts: { arabic: number; designer: number; niche: number };
  isActive: boolean;
};

const MONEY = /^\d{1,4}(?:\.\d{1,2})?$/;

export function validateMixedWholesaleForm(input: {
  minUnits: unknown;
  arabic: unknown;
  designer: unknown;
  niche: unknown;
  isActive: unknown;
}): ValidationResult<MixedWholesaleForm> {
  const errors: FieldErrors = {};
  const minRaw = typeof input.minUnits === "string" ? input.minUnits.trim() : "";
  const minUnits = /^[1-9]\d{0,3}$/.test(minRaw) ? Number(minRaw) : 0;
  if (!minUnits) errors.minUnits = "Escribe un número entero de 1 a 9999.";
  const discounts = { arabic: 0, designer: 0, niche: 0 };
  for (const type of ["arabic", "designer", "niche"] as const) {
    const raw = typeof input[type] === "string" ? (input[type] as string).trim() : "";
    const value = MONEY.test(raw) ? Number(raw) : 0;
    if (!(value > 0 && value <= 1000)) errors[type] = "Escribe un monto mayor que 0 y hasta S/ 1000, con máximo 2 decimales.";
    else discounts[type] = value;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { minUnits, discounts, isActive: input.isActive === true } };
}

/** The wholesale rule exactly as `promotion_rules` stores it. Only the three confirmed types exist; no tier above the threshold. */
export function mixedWholesaleRulePayload(form: MixedWholesaleForm) {
  return {
    conditions: { min_units: form.minUnits, count: "bottles" },
    actions: { discount_per_unit: { ...form.discounts }, currency: "PEN" },
  };
}

export type MixedWholesaleRule = {
  id: string;
  updatedAt: string;
  minUnits: number;
  discounts: { arabic: number; designer: number; niche: number };
  isActive: boolean;
};

/** Strict read of a stored `wholesale_mixed` row. A row that does not have the exact shape is treated as absent: no number is ever invented. */
export function readMixedWholesaleRule(row: { id: string; conditions: unknown; actions: unknown; is_active: boolean; updated_at: string } | null): MixedWholesaleRule | null {
  if (!row) return null;
  const conditions = row.conditions as { min_units?: unknown } | null;
  const discounts = (row.actions as { discount_per_unit?: Record<string, unknown> } | null)?.discount_per_unit;
  const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
  if (!conditions || !discounts || !Number.isInteger(conditions.min_units) || !positive(conditions.min_units)) return null;
  const { arabic, designer, niche } = discounts;
  if (!positive(arabic) || !positive(designer) || !positive(niche)) return null;
  return { id: row.id, updatedAt: row.updated_at, minUnits: conditions.min_units, discounts: { arabic, designer, niche }, isActive: row.is_active };
}

export function validateGiftExclusionIds(input: unknown): ValidationResult<string[]> {
  const raw = Array.isArray(input) ? input : [];
  const ids = [...new Set(raw.map((item) => (typeof item === "string" ? item.trim().toLowerCase() : "")))].filter(Boolean);
  if (ids.length > 50) return { ok: false, errors: { excluded: "Se admiten hasta 50 perfumes excluidos." } };
  if (!ids.every(isValidUuid)) return { ok: false, errors: { excluded: "Uno de los perfumes elegidos no es válido." } };
  return { ok: true, value: ids };
}

/** Shipping fee typed by the operator in soles ("15", "15.5", "15,50"); the order stores integer cents. Empty clears it. */
export function parseShippingCostToCents(input: unknown): ValidationResult<number | null> {
  const raw = typeof input === "string" ? input.trim().replace(",", ".") : "";
  if (raw === "") return { ok: true, value: null };
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(raw)) return { ok: false, errors: { shippingCost: "Escribe un monto en soles, por ejemplo 15 o 15.50." } };
  const [whole = "0", fraction = ""] = raw.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents > 100_000_000) return { ok: false, errors: { shippingCost: "El monto es demasiado alto." } };
  return { ok: true, value: cents };
}

export function formatCentsAsSoles(cents: number): string {
  return `S/ ${(cents / 100).toFixed(2)}`;
}
