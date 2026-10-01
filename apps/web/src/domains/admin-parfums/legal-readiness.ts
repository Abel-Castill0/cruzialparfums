import type { BusinessLegalSettingInput } from "./settings-schema";

/** Same three fields the public Libro de Reclamaciones requires before it can
 * show the provider's identity (see readBusinessLegalIdentity.isComplete). */
const IDENTITY_FIELDS: readonly { key: "legalName" | "ruc" | "address"; label: string }[] = [
  { key: "legalName", label: "razón social" },
  { key: "ruc", label: "RUC" },
  { key: "address", label: "dirección" },
];

/** Labels of the legal-identity fields still blank. Empty = complete. Never
 * fabricates a value: a missing/unreadable setting counts as everything missing. */
export function missingLegalIdentity(value: Pick<BusinessLegalSettingInput, "legalName" | "ruc" | "address"> | null): string[] {
  return IDENTITY_FIELDS.filter(({ key }) => !value || value[key].trim() === "").map(({ label }) => label);
}

export function legalIdentityNotice(missing: readonly string[]): { title: string; detail: string } | null {
  if (missing.length === 0) return null;
  return {
    title: "Faltan datos legales del negocio",
    detail: `Falta: ${missing.join(", ")}. Mientras tanto, el Libro de Reclamaciones público avisa al cliente que la identificación legal no está completa.`,
  };
}
