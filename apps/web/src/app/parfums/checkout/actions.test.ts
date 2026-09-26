import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const loadParfumsStorefront = vi.fn();
vi.mock("@/lib/catalog/parfums-storefront", () => ({
  loadParfumsStorefront: (...args: unknown[]) => loadParfumsStorefront(...args),
}));

const validateAndResolveParfumsOrder = vi.fn();
vi.mock("@/domains/orders/parfums-order-request", () => ({
  validateAndResolveParfumsOrder: (...args: unknown[]) => validateAndResolveParfumsOrder(...args),
}));

const repositoryCreate = vi.fn();
vi.mock("@/domains/orders/parfums-order-repository", () => ({
  ParfumsOrderRepository: class {
    create(...args: unknown[]) {
      return repositoryCreate(...args);
    }
  },
}));

vi.mock("@/domains/platform/settings", () => ({
  PARFUMS_SETTINGS: { whatsappNumber: "51999000000" },
}));

const getPersistedParfumsOrderSummary = vi.fn();
vi.mock("@/domains/orders/parfums-persisted-summary", () => ({
  getPersistedParfumsOrderSummary: (...args: unknown[]) => getPersistedParfumsOrderSummary(...args),
}));

const buildPersistedOrderRequestMessage = vi.fn(() => "message");
vi.mock("@/domains/whatsapp/parfums-message-builder", () => ({
  buildPersistedOrderRequestMessage: (...args: unknown[]) => buildPersistedOrderRequestMessage(...args),
  buildWhatsAppUrl: () => "https://wa.me/x",
}));

const checkOrderRequestRateLimit = vi.fn();
vi.mock("@/lib/security/order-abuse", () => ({
  checkOrderRequestRateLimit: (...args: unknown[]) => checkOrderRequestRateLimit(...args),
}));

const createSupabaseAdminClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: (...args: unknown[]) => createSupabaseAdminClient(...args),
}));

import { createParfumsOrderRequest } from "./actions";

const VALIDATED = {
  ok: true,
  requestId: "11111111-1111-4111-8111-111111111111",
  lines: [{ product_name: "P", variant_label: "V", quantity: 1, unit_price_amount: "10.00" }],
  subtotal: 10,
  customer: { name: "Ana", phone: "51987654321", district: "d", delivery: "d" },
};

const PERSISTED_SUMMARY = {
  orderNumber: "CRP-1",
  customerSnapshot: { name: "Ana", phone: "51987654321" },
  deliverySnapshot: { district: "d", delivery: "d", note: "" },
  subtotalAmount: 20,
  lines: [{ productNameSnapshot: "P", variantLabelSnapshot: "V", unitPriceAmount: 20, quantity: 1, lineTotalAmount: 20 }],
};

describe("createParfumsOrderRequest — Gate 2B rate limit integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    loadParfumsStorefront.mockResolvedValue({
      source: "supabase",
      catalog: { marker: "catalog" },
      contact: { whatsappNumber: "51999000000" },
    });
    validateAndResolveParfumsOrder.mockReturnValue(VALIDATED);
    createSupabaseAdminClient.mockReturnValue({ marker: "fake-client" });
    getPersistedParfumsOrderSummary.mockResolvedValue(PERSISTED_SUMMARY);
  });

  it("fails closed without touching the limiter or repository when the catalog is unavailable", async () => {
    loadParfumsStorefront.mockResolvedValue({ source: "unavailable", catalog: {}, contact: { whatsappNumber: "1" } });

    const result = await createParfumsOrderRequest({} as never);

    expect(result.status).toBe("error");
    expect(checkOrderRequestRateLimit).not.toHaveBeenCalled();
    expect(repositoryCreate).not.toHaveBeenCalled();
  });

  it("revalidates the cart against the storefront catalog, not a client-supplied one", async () => {
    checkOrderRequestRateLimit.mockResolvedValue({ kind: "allowed" });
    repositoryCreate.mockResolvedValue({ ok: true, data: { orderId: "order-1", orderNumber: "CRP-1", created: true } });

    await createParfumsOrderRequest({} as never);

    expect(validateAndResolveParfumsOrder).toHaveBeenCalledWith({}, { marker: "catalog" });
  });

  it("builds the WhatsApp handoff from the persisted order summary, never from the (possibly stale) validated request", async () => {
    checkOrderRequestRateLimit.mockResolvedValue({ kind: "allowed" });
    repositoryCreate.mockResolvedValue({ ok: true, data: { orderId: "order-1", orderNumber: "CRP-1", created: true } });

    await createParfumsOrderRequest({} as never);

    expect(getPersistedParfumsOrderSummary).toHaveBeenCalledWith({ marker: "fake-client" }, "order-1", VALIDATED.requestId);
    expect(buildPersistedOrderRequestMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        orderNumber: PERSISTED_SUMMARY.orderNumber,
        subtotal: PERSISTED_SUMMARY.subtotalAmount,
        lines: [expect.objectContaining({ lineTotal: 20 })],
      }),
    );
    // The stale validated subtotal (10) must never reach the message builder.
    expect(buildPersistedOrderRequestMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ subtotal: VALIDATED.subtotal }),
    );
  });

  it("returns a reference-only success with no WhatsApp link when the persisted summary cannot be fetched", async () => {
    checkOrderRequestRateLimit.mockResolvedValue({ kind: "allowed" });
    repositoryCreate.mockResolvedValue({ ok: true, data: { orderId: "order-1", orderNumber: "CRP-1", created: true } });
    getPersistedParfumsOrderSummary.mockResolvedValue(null);

    const result = await createParfumsOrderRequest({} as never);

    expect(result).toEqual({ status: "success", orderNumber: "CRP-1", whatsappUrl: null, created: true });
    expect(buildPersistedOrderRequestMessage).not.toHaveBeenCalled();
  });

  it("denies and never calls the repository when the limiter denies", async () => {
    checkOrderRequestRateLimit.mockResolvedValue({ kind: "denied", retryAfterSeconds: 600 });

    const result = await createParfumsOrderRequest({} as never);

    expect(repositoryCreate).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "error",
      message: "Recibimos varias solicitudes en poco tiempo. Espera unos minutos antes de intentarlo de nuevo.",
      code: "rate_limited",
      retryAfterSeconds: 600,
    });
  });

  it("fails closed (never calls the repository) when the limiter is unavailable", async () => {
    checkOrderRequestRateLimit.mockResolvedValue({ kind: "unavailable" });

    const result = await createParfumsOrderRequest({} as never);

    expect(repositoryCreate).not.toHaveBeenCalled();
    expect(result.status).toBe("error");
    expect((result as { code?: string }).code).toBeUndefined();
  });

  it("calls the repository once the limiter allows a new request", async () => {
    checkOrderRequestRateLimit.mockResolvedValue({ kind: "allowed" });
    repositoryCreate.mockResolvedValue({ ok: true, data: { orderId: "order-1", orderNumber: "CRP-1", created: true } });

    const result = await createParfumsOrderRequest({} as never);

    expect(repositoryCreate).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("success");
  });

  it("still calls the repository on an allowed duplicate-request retry (idempotency preserved)", async () => {
    checkOrderRequestRateLimit.mockResolvedValue({ kind: "allowed" });
    repositoryCreate.mockResolvedValue({ ok: true, data: { orderId: "order-1", orderNumber: "CRP-1", created: false } });

    const result = await createParfumsOrderRequest({} as never);

    expect(repositoryCreate).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("success");
    expect(result.status === "success" && result.created).toBe(false);
  });

  it("passes the parfums business unit and the validated requestId/phone to the limiter", async () => {
    checkOrderRequestRateLimit.mockResolvedValue({ kind: "allowed" });
    repositoryCreate.mockResolvedValue({ ok: true, data: { orderId: "order-1", orderNumber: "CRP-1", created: true } });

    await createParfumsOrderRequest({} as never);

    expect(checkOrderRequestRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "order_request",
        businessUnit: "parfums",
        requestId: VALIDATED.requestId,
        phone: VALIDATED.customer.phone,
      }),
    );
  });
});
