import { describe, expect, it, vi } from "vitest";
import { DisabledEmailProvider, notificationProviderReadiness, readWhatsAppConfig, WhatsAppCloudProvider } from "./provider";

const environment = {
  WHATSAPP_ACCESS_TOKEN: "fixture-token-not-a-credential",
  WHATSAPP_PARFUMS_PHONE_NUMBER_ID: "123456",
  WHATSAPP_GRAPH_API_VERSION: "v99.0",
  WHATSAPP_PARFUMS_TEMPLATES_JSON: JSON.stringify({ order_received: { name: "fixture_received", language: "es_PE" } }),
};
const message = { event: "order_received", recipient: "51999000123", reference: "TEST-123", idempotencyKey: "fixture" };

describe("notification provider readiness", () => {
  it("reports missing credentials honestly and never reads public aliases", () => {
    expect(notificationProviderReadiness("parfums", { NEXT_PUBLIC_WHATSAPP_ACCESS_TOKEN: "ignored" }).whatsapp).toBe("not_configured");
    expect(readWhatsAppConfig("parfums", {})).toBeNull();
  });
  it("keeps unit phone/template configuration separate", () => {
    expect(notificationProviderReadiness("parfums", environment)).toMatchObject({ whatsapp: "configured", coveredEvents: ["order_received"], email: "not_configured" });
    expect(notificationProviderReadiness("import", environment).whatsapp).toBe("not_configured");
  });
  it("does not expose secret values in health output", () => {
    expect(JSON.stringify(notificationProviderReadiness("parfums", environment))).not.toContain(environment.WHATSAPP_ACCESS_TOKEN);
  });
  it("rejects malformed template configuration and endpoint identifiers", () => {
    expect(new WhatsAppCloudProvider(readWhatsAppConfig("parfums", { ...environment, WHATSAPP_PARFUMS_TEMPLATES_JSON: "{" })).ready("order_received")).toBe(false);
    expect(readWhatsAppConfig("parfums", { ...environment, WHATSAPP_PARFUMS_PHONE_NUMBER_ID: "../other" })).toBeNull();
  });
});
describe("WhatsApp sender", () => {
  it("returns not configured without making a request", async () => {
    const request = vi.fn();
    expect(await new WhatsAppCloudProvider(null, request).send(message)).toEqual({ status: "blocked", error: "provider_not_configured" });
    expect(request).not.toHaveBeenCalled();
    expect(await new DisabledEmailProvider().send()).toMatchObject({ status: "blocked" });
  });
  it("sends only the approved template reference and records the real provider ID", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ messages: [{ id: "fixture-provider-id" }] }));
    const sender = new WhatsAppCloudProvider(readWhatsAppConfig("parfums", environment), request);
    expect(await sender.send(message)).toEqual({ status: "sent", providerMessageId: "fixture-provider-id" });
    expect(request).toHaveBeenCalledOnce();
    const body = JSON.parse(request.mock.calls[0]![1].body);
    expect(body.template.components[0].parameters).toEqual([{ type: "text", text: "TEST-123" }]);
    expect(body).not.toHaveProperty("customer_snapshot");
  });
  it("quarantines transport failure and missing acceptance ID instead of resending", async () => {
    const failed = vi.fn().mockRejectedValue(new Error("fixture timeout"));
    expect(await new WhatsAppCloudProvider(readWhatsAppConfig("parfums", environment), failed).send(message)).toEqual({ status: "uncertain", error: "provider_timeout" });
    expect(failed).toHaveBeenCalledOnce();
    const malformed = vi.fn().mockResolvedValue(Response.json({}));
    expect((await new WhatsAppCloudProvider(readWhatsAppConfig("parfums", environment), malformed).send(message)).status).toBe("uncertain");
  });
  it("retries a known rate-limit rejection and fails a known permanent rejection", async () => {
    const rateLimit = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
    const rejected = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
    expect((await new WhatsAppCloudProvider(readWhatsAppConfig("parfums", environment), rateLimit).send(message)).status).toBe("retry");
    expect((await new WhatsAppCloudProvider(readWhatsAppConfig("parfums", environment), rejected).send(message)).status).toBe("failed");
  });
});
