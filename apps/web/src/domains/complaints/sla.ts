export const COMPLAINT_URGENCY_LABELS = {
  normal: "Dentro del plazo",
  approaching: "Plazo próximo",
  overdue: "Plazo vencido",
  resolved: "Resuelto",
} as const;
export type ComplaintUrgency = keyof typeof COMPLAINT_URGENCY_LABELS;
export function isComplaintUrgency(value: unknown): value is ComplaintUrgency {
  return typeof value === "string" && Object.hasOwn(COMPLAINT_URGENCY_LABELS, value);
}

/** The timestamps are computed by PostgreSQL. This classifier presents those
 * facts; it never reconstructs or extends the legal deadline in the browser. */
export function classifyComplaintUrgency(
  entry: { status: string; dueAt: string; approachingAt: string },
  now: number = Date.now(),
): ComplaintUrgency {
  if (entry.status === "resolved") return "resolved";
  if (now > Date.parse(entry.dueAt)) return "overdue";
  if (now >= Date.parse(entry.approachingAt)) return "approaching";
  return "normal";
}
