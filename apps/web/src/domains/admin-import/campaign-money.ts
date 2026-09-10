/**
 * Canonicalizes a PostgreSQL numeric value that has already crossed the
 * DB boundary as text. Numbers are deliberately rejected: accepting one
 * here would silently reintroduce the lossy numeric -> JS number path.
 */
export function canonicalizeCampaignMoneyText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  return `${match[1]}.${(match[2] ?? "").padEnd(2, "0")}`;
}
