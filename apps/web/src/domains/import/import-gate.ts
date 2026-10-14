/**
 * Visual state of the Import door on the gateway (`/`). Presentation only:
 * whether Import can actually be bought is decided by the campaign RPCs
 * elsewhere; this just says what the card should look like.
 */
export type ImportGate =
  | { state: "open" }
  | { state: "closed"; opensAt: string | null }
  | { state: "unknown" };

export const IMPORT_GATE_HEADLINE = "Estamos preparando el próximo consolidado";
export const IMPORT_GATE_FALLBACK = "Próximamente";

const LIMA = "America/Lima";

/** "Apertura estimada: 14 de noviembre" or "Próximamente" when the date is missing or unreadable. */
export function describeImportGateDate(opensAt: string | null, now: Date = new Date()): string {
  if (!opensAt) return IMPORT_GATE_FALLBACK;
  const date = new Date(opensAt);
  if (Number.isNaN(date.getTime())) return IMPORT_GATE_FALLBACK;
  const sameYear =
    new Intl.DateTimeFormat("es-PE", { year: "numeric", timeZone: LIMA }).format(date) ===
    new Intl.DateTimeFormat("es-PE", { year: "numeric", timeZone: LIMA }).format(now);
  const label = new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: LIMA,
  }).format(date);
  return `Apertura estimada: ${label}`;
}
