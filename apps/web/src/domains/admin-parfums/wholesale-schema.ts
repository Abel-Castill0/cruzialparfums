import type { FieldErrors, ValidationResult } from "./product-schema";
import { isValidExpectedTimestamp } from "./category-schema";

export const WHOLESALE_COMMERCIAL_TYPES = ["arabic", "designer", "niche"] as const;
export type WholesaleCommercialType = (typeof WHOLESALE_COMMERCIAL_TYPES)[number];

export const WHOLESALE_COMMERCIAL_TYPE_LABELS: Record<WholesaleCommercialType, string> = {
  arabic: "Árabe",
  designer: "Diseñador",
  niche: "Nicho",
};

export type WholesalePolicyInput = {
  minQuantity: number;
  /** Canonical decimal string, sent to Postgres numeric without JS arithmetic. */
  discountAmount: string;
  isActive: boolean;
};

function normalizeMoney(value: unknown, errors: FieldErrors): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(raw)) {
    errors.discountAmount = "Ingresa un descuento positivo con máximo 2 decimales.";
    return "";
  }
  const parts = raw.split(".");
  const whole = parts[0] ?? "0";
  const fraction = parts[1] ?? "";
  const wholeUnits = Number(whole);
  const fractionUnits = Number(fraction.padEnd(2, "0"));
  if (
    (wholeUnits === 0 && fractionUnits === 0)
    || wholeUnits > 100_000
    || (wholeUnits === 100_000 && fractionUnits > 0)
  ) {
    errors.discountAmount = "El descuento debe ser mayor que 0 y no superar S/100,000.";
    return "";
  }
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

export function validateWholesalePolicyForm(
  input: Record<string, unknown>,
): ValidationResult<WholesalePolicyInput> {
  const errors: FieldErrors = {};
  const minQuantity = Number(input.minQuantity);
  if (!Number.isSafeInteger(minQuantity) || minQuantity <= 0 || minQuantity > 1_000_000) {
    errors.minQuantity = "El mínimo debe ser un entero entre 1 y 1,000,000.";
  }
  const discountAmount = normalizeMoney(input.discountAmount, errors);

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      minQuantity,
      discountAmount,
      isActive: input.isActive === true || input.isActive === "on",
    },
  };
}

export function isWholesaleCommercialType(value: unknown): value is WholesaleCommercialType {
  return typeof value === "string"
    && (WHOLESALE_COMMERCIAL_TYPES as readonly string[]).includes(value);
}

export { isValidExpectedTimestamp };
