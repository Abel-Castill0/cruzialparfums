import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const cookieJar = vi.hoisted(() => new Map<string, { value: string; options?: Record<string, unknown> }>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      cookieJar.set(name, { value, options });
    },
  }),
  headers: async () => new Headers(),
}));
const createSupabaseAdminClient = vi.fn();
const checkOrderRequestRateLimit = vi.fn();
const submitComplaintEntry = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: (...args: unknown[]) => createSupabaseAdminClient(...args) }));
vi.mock("@/lib/security/order-abuse", () => ({ checkOrderRequestRateLimit: (...args: unknown[]) => checkOrderRequestRateLimit(...args) }));
vi.mock("@/domains/complaints/complaint-repository", () => ({ submitComplaintEntry: (...args: unknown[]) => submitComplaintEntry(...args) }));

import { COMPLAINT_RECEIPT_FIELDS, toComplaintConsumerReceipt } from "@/domains/complaints/complaint-receipt";
import { mintAttemptToken } from "@/lib/security/attempt-token";
import { startNewComplaintAttempt, submitComplaintAction } from "./actions";

const COOKIE = "cz_attempt_complaint";

const input = {
  complaintType: "reclamo", fullName: "Ana Pérez", documentType: "dni",
  documentNumber: "12345678", address: "Av. Lima 123", phone: "987654321",
  email: "ana@example.test", isMinor: false, guardianFullName: "",
  guardianDocumentNumber: "", orderReference: "", detail: "Detalle válido",
  consumerRequest: "Solicito respuesta",
};
const receipt = { reference: "10101010-1010-4010-8010-101010101010" };
const derivedIds = () => submitComplaintEntry.mock.calls.map((call) => call[2] as string);

describe("public complaint action boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSupabaseAdminClient.mockReturnValue({});
    checkOrderRequestRateLimit.mockResolvedValue({ kind: "allowed" });
    submitComplaintEntry.mockResolvedValue({ ok: true, data: receipt });
    cookieJar.clear();
    cookieJar.set(COOKIE, { value: mintAttemptToken() });
  });

  it.each([
    ["detail", 4001],
    ["consumerRequest", 2001],
  ] as const)("rejects an oversized %s before any database call", async (field, length) => {
    const result = await submitComplaintAction("parfums", { ...input, [field]: "X".repeat(length) });
    expect(result).toMatchObject({ status: "error", fieldErrors: { [field]: expect.any(String) } });
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(checkOrderRequestRateLimit).not.toHaveBeenCalled();
    expect(submitComplaintEntry).not.toHaveBeenCalled();
  });

  it.each([
    ["detail", 4000],
    ["consumerRequest", 2000],
  ] as const)("passes the complete accepted %s to persistence", async (field, length) => {
    const value = "X".repeat(length);
    const result = await submitComplaintAction("parfums", { ...input, [field]: value });
    expect(result.status).toBe("success");
    expect(submitComplaintEntry).toHaveBeenCalledWith(expect.anything(), "parfums", expect.any(String), expect.objectContaining({ [field]: value }));
  });

  it("returns only the consumer-safe receipt the repository produced", async () => {
    const result = await submitComplaintAction("parfums", input);

    expect(result).toEqual({ status: "success", receipt });
  });

  it("Gate A2: rate-limits with purpose 'complaint', never 'order_request'", async () => {
    await submitComplaintAction("parfums", input);
    expect(checkOrderRequestRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "complaint", businessUnit: "parfums", requestId: derivedIds()[0], phone: input.phone }),
    );
  });
});

describe("public complaint replay protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieJar.clear();
    createSupabaseAdminClient.mockReturnValue({});
    checkOrderRequestRateLimit.mockResolvedValue({ kind: "allowed" });
    submitComplaintEntry.mockResolvedValue({ ok: true, data: receipt });
  });

  it("fails closed without a capability: nothing is persisted, an HttpOnly cookie is issued", async () => {
    const result = await submitComplaintAction("parfums", input);

    expect(result).toMatchObject({ status: "error", code: "attempt_required" });
    expect(checkOrderRequestRateLimit).not.toHaveBeenCalled();
    expect(submitComplaintEntry).not.toHaveBeenCalled();
    expect(cookieJar.get(COOKIE)!.options).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/libro-de-reclamaciones" });
  });

  it("same browser replays (even with a changed payload); a second browser cannot address the original", async () => {
    cookieJar.set(COOKIE, { value: mintAttemptToken() });
    await submitComplaintAction("parfums", input);
    await submitComplaintAction("parfums", { ...input, detail: "Otro detalle distinto" });
    cookieJar.set(COOKIE, { value: mintAttemptToken() });
    await submitComplaintAction("parfums", input);

    const [original, sameBrowserReplay, secondBrowser] = derivedIds();
    expect(sameBrowserReplay).toBe(original);
    expect(secondBrowser).not.toBe(original);
  });

  it("offers no parameter through which a request or complaint UUID can address an existing entry", async () => {
    cookieJar.set(COOKIE, { value: mintAttemptToken() });
    const knownComplaintId = "10101010-1010-4010-8010-101010101010";
    await submitComplaintAction("parfums", { ...input, requestId: knownComplaintId, id: knownComplaintId });

    expect(derivedIds()[0]).not.toBe(knownComplaintId);
    expect(submitComplaintEntry.mock.calls[0]![3]).not.toHaveProperty("requestId");
    expect(submitComplaintEntry.mock.calls[0]![3]).not.toHaveProperty("id");
  });

  it("scopes the attempt by business unit", async () => {
    cookieJar.set(COOKIE, { value: mintAttemptToken() });
    await submitComplaintAction("parfums", input);
    await submitComplaintAction("import", input);

    const [parfums, importUnit] = derivedIds();
    expect(importUnit).not.toBe(parfums);
  });

  it("registering another complaint rotates the attempt", async () => {
    cookieJar.set(COOKIE, { value: mintAttemptToken() });
    await submitComplaintAction("parfums", input);
    await startNewComplaintAttempt();
    await submitComplaintAction("parfums", input);

    const [first, next] = derivedIds();
    expect(next).not.toBe(first);
  });
});

describe("ComplaintConsumerReceipt", () => {
  const row = {
    id: "10101010-1010-4010-8010-101010101010", request_id: "20202020-2020-4020-8020-202020202020",
    business_unit_id: "11111111-1111-4111-8111-111111111111", status: "resolved", complaint_type: "reclamo",
    full_name: "Ana Pérez", document_type: "dni", document_number: "12345678", address: "Av. Lima 123",
    phone: "987654321", email: "ana@example.test", is_minor: false, guardian_full_name: null,
    guardian_document_number: null, order_reference: null, detail: "Detalle", consumer_request: "Solicito",
    admin_notes: "NOTA INTERNA DEL OPERADOR", resolved_by: "30303030-3030-4030-8030-303030303030",
    resolved_at: "2026-01-02T00:00:00Z", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z",
    due_at: "2026-01-22T00:00:00Z", approaching_at: "2026-01-18T00:00:00Z",
  };

  it("is built by allowlist: admin notes, resolver, status and request id never cross serialization", () => {
    const built = toComplaintConsumerReceipt(row as never, "parfums");
    const wire = JSON.stringify(built);

    expect(Object.keys(built).sort()).toEqual([...COMPLAINT_RECEIPT_FIELDS].sort());
    for (const secret of [row.admin_notes, row.resolved_by, row.request_id, row.business_unit_id, "resolved", row.approaching_at, row.updated_at]) {
      expect(wire).not.toContain(secret);
    }
    expect(built.reference).toBe(row.id);
  });
});
