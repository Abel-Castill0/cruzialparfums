// Shared factual age grouping for admin order inboxes (Parfums + Import) —
// see Task 5. No invented SLA: these are plain elapsed-time buckets, never
// a "late"/"overdue" label, because no business SLA exists to measure
// against. Bucketed in America/Lima wall-clock days, matching the timezone
// convention already used for campaign windows (see campaign-schema.ts).
const LIMA_OFFSET_MINUTES = 5 * 60;

export const ORDER_AGE_BUCKETS = ["today", "recent", "old"] as const;
export type OrderAgeBucket = (typeof ORDER_AGE_BUCKETS)[number];

export const ORDER_AGE_LABELS: Record<OrderAgeBucket, string> = {
  today: "Hoy",
  recent: "1-2 días",
  old: "3+ días",
};

export function isOrderAgeBucket(value: unknown): value is OrderAgeBucket {
  return typeof value === "string" && (ORDER_AGE_BUCKETS as readonly string[]).includes(value);
}

function limaStartOfDayUtcIso(daysAgo: number): string {
  const limaNowMs = Date.now() - LIMA_OFFSET_MINUTES * 60_000;
  const limaNow = new Date(limaNowMs);
  const startOfDayShifted = Date.UTC(
    limaNow.getUTCFullYear(),
    limaNow.getUTCMonth(),
    limaNow.getUTCDate() - daysAgo,
    0,
    0,
    0,
    0,
  );
  return new Date(startOfDayShifted + LIMA_OFFSET_MINUTES * 60_000).toISOString();
}

/** `gte`/`lt` bounds (ISO, half-open) for a created_at range query. */
export function orderAgeRange(bucket: OrderAgeBucket): { gte?: string; lt?: string } {
  const todayStart = limaStartOfDayUtcIso(0);
  const twoDaysAgoStart = limaStartOfDayUtcIso(2);
  if (bucket === "today") return { gte: todayStart };
  if (bucket === "recent") return { gte: twoDaysAgoStart, lt: todayStart };
  return { lt: twoDaysAgoStart };
}
