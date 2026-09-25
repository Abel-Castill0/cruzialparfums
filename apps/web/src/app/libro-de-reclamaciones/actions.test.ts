import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const createSupabaseAdminClient = vi.fn();
const checkOrderRequestRateLimit = vi.fn();
const submitComplaintEntry = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: (...args: unknown[]) => createSupabaseAdminClient(...args) }));
vi.mock("@/lib/security/order-abuse", () => ({ checkOrderRequestRateLimit: (...args: unknown[]) => checkOrderRequestRateLimit(...args) }));
vi.mock("@/domains/complaints/complaint-repository", () => ({ submitComplaintEntry: (...args: unknown[]) => submitComplaintEntry(...args) }));

import { submitComplaintAction } from "./actions";

const input = {
  complaintType: "reclamo", fullName: "Ana Pérez", documentType: "dni",
  documentNumber: "12345678", address: "Av. Lima 123", phone: "987654321",
  email: "ana@example.test", isMinor: false, guardianFullName: "",
  guardianDocumentNumber: "", orderReference: "", detail: "Detalle válido",
  consumerRequest: "Solicito respuesta",
};
const requestId = "10101010-1010-4010-8010-101010101010";

describe("public complaint action boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSupabaseAdminClient.mockReturnValue({});
    checkOrderRequestRateLimit.mockResolvedValue({ kind: "allowed" });
    submitComplaintEntry.mockResolvedValue({ ok: true, data: { id: requestId } });
  });

  it.each([
    ["detail", 4001],
    ["consumerRequest", 2001],
  ] as const)("rejects an oversized %s before any database call", async (field, length) => {
    const result = await submitComplaintAction("parfums", requestId, { ...input, [field]: "X".repeat(length) });
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
    const result = await submitComplaintAction("parfums", requestId, { ...input, [field]: value });
    expect(result.status).toBe("success");
    expect(submitComplaintEntry).toHaveBeenCalledWith(expect.anything(), "parfums", requestId, expect.objectContaining({ [field]: value }));
  });
});
