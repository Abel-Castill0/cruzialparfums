/**
 * What the Import hero says about the campaign, in two small pieces: a badge ("Abierto", "Próximamente", "Cerrado") and one
 * short date line under it. Pure on purpose, so the wording and the rules about stale dates are tested without rendering.
 */
export type ImportHeroState = "campaign" | "upcoming" | "closed" | "unavailable";

export type ImportHeroBadge = { label: "Abierto" | "Próximamente" | "Cerrado"; tone: "open" | "soon" | "closed" };

export type ImportHeroStatus = { badge: ImportHeroBadge | null; dateLine: string | null };

const LIMA = "America/Lima";

/** "15 nov 2026": day, short month without the trailing period, year; in Lima time. */
export function shortDate(iso: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const parts = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: LIMA }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")} ${get("month").replace(/\.$/, "")} ${get("year")}`;
}

function isFuture(iso: string | null | undefined, now: Date): iso is string {
  if (!iso) return false;
  const at = new Date(iso);
  return !Number.isNaN(at.getTime()) && at.getTime() > now.getTime();
}

/**
 * - open: badge "Abierto" and "Cierre: <date>" while the closing date is still ahead (a past date on an open campaign
 *   would only confuse, so the line is left out);
 * - upcoming: badge "Próximamente" and "Apertura estimada: <date>" (it is an estimate the owner can edit; a past or missing
 *   date reads "por confirmar" instead of promising one);
 * - closed (no campaign): badge "Cerrado", no date;
 * - unavailable (the state could not be read): nothing, so the hero never claims a status it cannot back up.
 */
export function importHeroStatus(
  input: { state: ImportHeroState; opensAt?: string | null; closesAt?: string | null },
  now: Date = new Date(),
): ImportHeroStatus {
  switch (input.state) {
    case "campaign":
      return {
        badge: { label: "Abierto", tone: "open" },
        dateLine: isFuture(input.closesAt, now) ? `Cierre: ${shortDate(input.closesAt)}` : null,
      };
    case "upcoming":
      return {
        badge: { label: "Próximamente", tone: "soon" },
        dateLine: `Apertura estimada: ${isFuture(input.opensAt, now) ? shortDate(input.opensAt) : "por confirmar"}`,
      };
    case "closed":
      return { badge: { label: "Cerrado", tone: "closed" }, dateLine: null };
    default:
      return { badge: null, dateLine: null };
  }
}
