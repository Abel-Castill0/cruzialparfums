import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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

import { createImportOrderRequest } from "./actions";

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
