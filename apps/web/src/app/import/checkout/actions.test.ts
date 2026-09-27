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

const validateAndResolveImportOrder = vi.fn();
vi.mock("@/domains/orders/import-order-request", () => ({
  validateAndResolveImportOrder: (...args: unknown[]) => validateAndResolveImportOrder(...args),
}));

const repositoryCreate = vi.fn();
vi.mock("@/domains/orders/import-order-repository", () => ({
  ImportOrderRepository: class {
    create(...args: unknown[]) {
      return repositoryCreate(...args);
    }
  },
}));

vi.mock("@/domains/orders/import-persisted-summary", () => ({
  getPersistedImportOrderSummary: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/domains/import/import-public-contact", () => ({
  readImportPublicContact: vi.fn().mockResolvedValue(null),
}));

const checkOrderRequestRateLimit = vi.fn();
vi.mock("@/lib/security/order-abuse", () => ({
  checkOrderRequestRateLimit: (...args: unknown[]) => checkOrderRequestRateLimit(...args),
}));

const createSupabaseAdminClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: (...args: unknown[]) => createSupabaseAdminClient(...args),
}));

import { mintAttemptToken } from "@/lib/security/attempt-token";
import { createImportOrderRequest } from "./actions";

const COOKIE = "cz_attempt_import_order";

const VALIDATED = {
  requestId: "22222222-2222-4222-8222-222222222222",
  customer: { name: "Ana", phone: "51987654321" },
  delivery: { district: "d", address: "a", note: "" },
  lines: [{ productNameSnapshot: "P" }],
};

describe("createImportOrderRequest — Gate 2B rate limit integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    validateAndResolveImportOrder.mockReturnValue(VALIDATED);
    createSupabaseAdminClient.mockReturnValue({ marker: "fake-client" });
    cookieJar.clear();
    cookieJar.set(COOKIE, { value: mintAttemptToken() });
  });

  it("denies and never calls the repository when the limiter denies", async () => {
    checkOrderRequestRateLimit.mockResolvedValue({ kind: "denied", retryAfterSeconds: 3600 });

    const result = await createImportOrderRequest({} as never);

    expect(repositoryCreate).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "error",
      message: "Recibimos varias solicitudes en poco tiempo. Espera unos minutos antes de intentarlo de nuevo.",
      code: "rate_limited",
      retryAfterSeconds: 3600,
    });
  });

  it("fails closed (never calls the repository) when the limiter is unavailable", async () => {
    checkOrderRequestRateLimit.mockResolvedValue({ kind: "unavailable" });

    const result = await createImportOrderRequest({} as never);

    expect(repositoryCreate).not.toHaveBeenCalled();
    expect(result.status).toBe("error");
    expect((result as { code?: string }).code).toBeUndefined();
  });

  it("calls the repository once the limiter allows a new request, scoped to the import business unit", async () => {
    checkOrderRequestRateLimit.mockResolvedValue({ kind: "allowed" });
    repositoryCreate.mockResolvedValue({
      ok: true,
      data: {
        orderId: "order-1",
        orderNumber: "CRI-1",
        created: true,
        subtotal: 10,
        depositPercentage: 50,
        depositAmount: 5,
        campaignNumber: 1,
      },
    });

    const result = await createImportOrderRequest({} as never);

    expect(repositoryCreate).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("success");
    expect(checkOrderRequestRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "order_request",
        businessUnit: "import",
        requestId: VALIDATED.requestId,
        phone: VALIDATED.customer.phone,
      }),
    );
  });
});

describe("createImportOrderRequest — anonymous attempt capability", () => {
  const derivedIds = () => validateAndResolveImportOrder.mock.calls.map((call) => (call[0] as { requestId: string }).requestId);

  beforeEach(() => {
    vi.clearAllMocks();
    cookieJar.clear();
    validateAndResolveImportOrder.mockReturnValue(VALIDATED);
    createSupabaseAdminClient.mockReturnValue({ marker: "fake-client" });
    checkOrderRequestRateLimit.mockResolvedValue({ kind: "allowed" });
    repositoryCreate.mockResolvedValue({
      ok: true,
      data: { orderId: "o", orderNumber: "CRI-1", created: true, subtotal: 1, depositPercentage: 50, depositAmount: 0.5, campaignNumber: 6 },
    });
  });

  it("fails closed with no capability and issues an Import-scoped HttpOnly cookie", async () => {
    const result = await createImportOrderRequest({} as never);

    expect(result).toMatchObject({ status: "error", code: "attempt_required" });
    expect(validateAndResolveImportOrder).not.toHaveBeenCalled();
    expect(repositoryCreate).not.toHaveBeenCalled();
    expect(cookieJar.get(COOKIE)!.options).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/import/checkout" });
  });

  it("ignores a client-supplied requestId and replays only with the same capability", async () => {
    const victimRequestId = "22222222-2222-4222-8222-222222222222";
    cookieJar.set(COOKIE, { value: mintAttemptToken() });
    await createImportOrderRequest({ requestId: victimRequestId } as never);
    await createImportOrderRequest({ requestId: victimRequestId } as never);
    cookieJar.set(COOKIE, { value: mintAttemptToken() });
    await createImportOrderRequest({ requestId: victimRequestId } as never);

    const [first, sameBrowserRetry, otherBrowser] = derivedIds();
    expect(first).not.toBe(victimRequestId);
    expect(sameBrowserRetry).toBe(first);
    expect(otherBrowser).not.toBe(first);
  });

  it("a Parfums capability is never accepted by Import (separate cookie, domain-separated id)", async () => {
    const parfumsToken = mintAttemptToken();
    cookieJar.set("cz_attempt_parfums_order", { value: parfumsToken });

    expect(await createImportOrderRequest({} as never)).toMatchObject({ code: "attempt_required" });

    // Even copied verbatim into the Import cookie it derives an Import-only id.
    cookieJar.set(COOKIE, { value: parfumsToken });
    await createImportOrderRequest({} as never);
    const { deriveAttemptRequestId, parseAttemptToken } = await import("@/lib/security/attempt-token");
    const parsed = parseAttemptToken(parfumsToken);
    if (!parsed.ok) throw new Error("fixture token must parse");
    expect(derivedIds()[0]).toBe(deriveAttemptRequestId("import-order", "import", parsed));
    expect(derivedIds()[0]).not.toBe(deriveAttemptRequestId("parfums-order", "parfums", parsed));
  });
});
