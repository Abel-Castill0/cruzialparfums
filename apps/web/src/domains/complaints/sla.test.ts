import { describe, expect, it } from "vitest";
import { classifyComplaintUrgency, isComplaintUrgency } from "./sla";
const entry = { status: "received", approachingAt: "2026-09-28T05:00:00Z", dueAt: "2026-10-01T04:59:59Z" };
describe("complaint SLA presentation", () => {
  it("classifies the authoritative reminder and deadline boundaries", () => {
    expect(classifyComplaintUrgency(entry, Date.parse("2026-09-28T04:59:59Z"))).toBe("normal");
    expect(classifyComplaintUrgency(entry, Date.parse(entry.approachingAt))).toBe("approaching");
    expect(classifyComplaintUrgency(entry, Date.parse(entry.dueAt))).toBe("approaching");
    expect(classifyComplaintUrgency(entry, Date.parse(entry.dueAt) + 1)).toBe("overdue");
  });
  it("keeps resolved cases out of urgent unresolved work", () => {
    expect(classifyComplaintUrgency({ ...entry, status: "resolved" }, Date.parse("2027-01-01T00:00:00Z"))).toBe("resolved");
  });
  it("accepts only real urgency filters", () => {
    expect(isComplaintUrgency("overdue")).toBe(true);
    expect(isComplaintUrgency("tomorrow")).toBe(false);
    expect(isComplaintUrgency(undefined)).toBe(false);
  });
});
