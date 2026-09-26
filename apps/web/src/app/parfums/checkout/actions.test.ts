import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// In-memory browser cookie jar: the real attempt-capability code runs.
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

import { mintAttemptToken } from "@/lib/security/attempt-token";
import { createParfumsOrderRequest, startNewParfumsCheckoutAttempt } from "./actions";

const COOKIE = "cz_attempt_parfums_order";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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
    cookieJar.clear();
    cookieJar.set(COOKIE, { value: mintAttemptToken() });
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

    expect(validateAndResolveParfumsOrder).toHaveBeenCalledWith(
      { requestId: expect.stringMatching(UUID_V4) },
      { marker: "catalog" },
    );
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

describe("createParfumsOrderRequest — anonymous attempt capability", () => {
  const derivedIds = () => validateAndResolveParfumsOrder.mock.calls.map((call) => (call[0] as { requestId: string }).requestId);

  beforeEach(() => {
    vi.clearAllMocks();
    cookieJar.clear();
    loadParfumsStorefront.mockResolvedValue({
      source: "supabase",
      catalog: { marker: "catalog" },
      contact: { whatsappNumber: "51999000000" },
    });
    validateAndResolveParfumsOrder.mockReturnValue(VALIDATED);
    createSupabaseAdminClient.mockReturnValue({ marker: "fake-client" });
    getPersistedParfumsOrderSummary.mockResolvedValue(PERSISTED_SUMMARY);
    checkOrderRequestRateLimit.mockResolvedValue({ kind: "allowed" });
    repositoryCreate.mockResolvedValue({ ok: true, data: { orderId: "order-1", orderNumber: "CRP-1", created: true } });
  });

  it("fails closed with no capability: issues one, touches no limiter/validator/persistence", async () => {
    const result = await createParfumsOrderRequest({ lines: [], customer: {} } as never);

    expect(result).toMatchObject({ status: "error", code: "attempt_required" });
    expect(validateAndResolveParfumsOrder).not.toHaveBeenCalled();
    expect(checkOrderRequestRateLimit).not.toHaveBeenCalled();
    expect(repositoryCreate).not.toHaveBeenCalled();
    const issued = cookieJar.get(COOKIE)!;
    expect(issued.value).toMatch(/^v1\./);
    expect(issued.options).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/parfums/checkout" });
  });

  it("proceeds on the retry that carries the freshly issued capability", async () => {
    await createParfumsOrderRequest({} as never);
    const result = await createParfumsOrderRequest({} as never);

    expect(result.status).toBe("success");
    expect(repositoryCreate).toHaveBeenCalledTimes(1);
    expect(derivedIds()[0]).toMatch(UUID_V4);
  });

  it("ignores a client-supplied requestId (knowing a victim's id grants nothing)", async () => {
    cookieJar.set(COOKIE, { value: mintAttemptToken() });
    const victimRequestId = "11111111-1111-4111-8111-111111111111";

    await createParfumsOrderRequest({ requestId: victimRequestId } as never);

    expect(derivedIds()[0]).not.toBe(victimRequestId);
  });

  it("same browser: a lost-response retry (even after reload) derives the SAME id", async () => {
    cookieJar.set(COOKIE, { value: mintAttemptToken() });
    await createParfumsOrderRequest({} as never);
    await createParfumsOrderRequest({ lines: [{ productId: "changed" }] } as never);

    const [first, retry] = derivedIds();
    expect(retry).toBe(first);
  });

  it("different browser: an independent capability derives a different id", async () => {
    cookieJar.set(COOKIE, { value: mintAttemptToken() });
    await createParfumsOrderRequest({} as never);
    cookieJar.set(COOKIE, { value: mintAttemptToken() });
    await createParfumsOrderRequest({} as never);

    const [browserA, browserB] = derivedIds();
    expect(browserB).not.toBe(browserA);
  });

  it("rejects a malformed/forged capability and never replays through a tampered one", async () => {
    cookieJar.set(COOKIE, { value: "v1.not-a-real-nonce.1" });
    expect(await createParfumsOrderRequest({} as never)).toMatchObject({ code: "attempt_required" });
    expect(repositoryCreate).not.toHaveBeenCalled();

    const original = mintAttemptToken();
    cookieJar.set(COOKIE, { value: original });
    await createParfumsOrderRequest({} as never);
    const [head, nonce, issuedAt] = original.split(".");
    const flipped = `${nonce!.startsWith("A") ? "B" : "A"}${nonce!.slice(1)}`;
    cookieJar.set(COOKIE, { value: `${head}.${flipped}.${issuedAt}` });
    await createParfumsOrderRequest({} as never);

    const [originalId, tamperedId] = derivedIds();
    expect(tamperedId).not.toBe(originalId);
  });

  it("treats an expired capability as absent", async () => {
    const twoDaysAgo = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
    cookieJar.set(COOKIE, { value: mintAttemptToken(twoDaysAgo) });

    expect(await createParfumsOrderRequest({} as never)).toMatchObject({ code: "attempt_required" });
    expect(repositoryCreate).not.toHaveBeenCalled();
  });

  it("an explicit new purchase rotates the attempt to a fresh id", async () => {
    cookieJar.set(COOKIE, { value: mintAttemptToken() });
    await createParfumsOrderRequest({} as never);
    await startNewParfumsCheckoutAttempt();
    await createParfumsOrderRequest({} as never);

    const [before, after] = derivedIds();
    expect(after).not.toBe(before);
    expect(cookieJar.get(COOKIE)!.options).toMatchObject({ httpOnly: true, path: "/parfums/checkout" });
  });
});
