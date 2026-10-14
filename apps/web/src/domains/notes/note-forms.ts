import type { FieldErrors, ValidationResult } from "../admin-parfums/product-schema";

/**
 * Notes (aromas) of a perfume: admin form validation and the order helpers behind the up/down buttons.
 * The database repeats every rule (CHECK constraints and admin_save_note); these messages are what the operator reads first.
 */
export const NOTE_TYPES = ["general", "top", "heart", "base"] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  general: "General (lista simple)",
  top: "Salida",
  heart: "Corazón",
  base: "Fondo",
};

export const MAX_NOTES_PER_PRODUCT = 30;

export type NoteForm = {
  name: string;
  type: NoteType;
  description: string;
  imageUrl: string;
  isActive: boolean;
};

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max + 1) : "";
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.hostname.includes(".");
  } catch {
    return false;
  }
}

export function validateNoteForm(input: { name: unknown; type: unknown; description: unknown; imageUrl: unknown; isActive: unknown }): ValidationResult<NoteForm> {
  const errors: FieldErrors = {};
  const name = text(input.name, 60);
  const description = text(input.description, 300);
  const imageUrl = typeof input.imageUrl === "string" ? input.imageUrl.trim() : "";
  const type = NOTE_TYPES.find((candidate) => candidate === input.type);
  if (name.length < 2 || name.length > 60) errors.name = "Escribe el nombre de la nota (2 a 60 caracteres).";
  else if (!/[a-z0-9]/i.test(name.normalize("NFD").replace(/[̀-ͯ]/g, ""))) errors.name = "El nombre necesita letras o números.";
  if (!type) errors.type = "Elige un tipo de nota.";
  if (description.length > 300) errors.description = "La descripción admite hasta 300 caracteres.";
  if (imageUrl && (imageUrl.length > 500 || !isHttpsUrl(imageUrl))) errors.imageUrl = "La imagen debe ser una dirección https válida.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, type: type!, description, imageUrl, isActive: input.isActive === true } };
}

/** Moves the item at `index` one place up (-1) or down (+1). Returns a new array; out-of-range moves return the list unchanged. */
export function moveItem<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return [...items];
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item as T);
  return next;
}

export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
