import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseWhatsAppDeliveryEvents, verifyWhatsAppSignature } from "./webhook";
import { automationAuthorized } from "./automation-auth";

describe("provider and scheduler authorization", () => {
  it("verifies exact raw bytes and denies missing, forged and malformed signatures", () => {
    const body = '{"fixture":"á"}';
    const signature = `sha256=${createHmac("sha256", "fixture-secret").update(body).digest("hex")}`;
    expect(verifyWhatsAppSignature(body, signature, "fixture-secret")).toBe(true);
    expect(verifyWhatsAppSignature(`${body} `, signature, "fixture-secret")).toBe(false);
    expect(verifyWhatsAppSignature(body, null, "fixture-secret")).toBe(false);
    expect(verifyWhatsAppSignature(body, "sha256=123", "fixture-secret")).toBe(false);
    expect(verifyWhatsAppSignature(body, signature, undefined)).toBe(false);
  });
  it("requires a configured server secret before allowing queue processing", () => {
    const secret = "fixture-automation-secret-with-32-characters";
    expect(automationAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(automationAuthorized(null, secret)).toBe(false);
    expect(automationAuthorized("Bearer undefined", undefined)).toBe(false);
    expect(automationAuthorized("Bearer short", "short")).toBe(false);
  });
});
describe("bounded delivery ingestion", () => {
  const payload = { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: {
    metadata: { phone_number_id: "123" },
    statuses: [{ id: "fixture-message", status: "delivered", timestamp: "1750000000", recipient_id: "ignored" }],
    messages: [{ text: { body: "must not be retained" } }],
  } }] }] };
  it("retains status proof without customer or message bodies", () => {
    expect(parseWhatsAppDeliveryEvents(payload, ["123"])).toEqual([
      { messageId: "fixture-message", status: "delivered", occurredAt: new Date(1750000000000).toISOString() },
    ]);
    expect(JSON.stringify(parseWhatsAppDeliveryEvents(payload, ["123"]))).not.toContain("ignored");
  });
  it("ignores foreign phone IDs and malformed payloads", () => {
    expect(parseWhatsAppDeliveryEvents(payload, ["other"])).toEqual([]);
    expect(parseWhatsAppDeliveryEvents({ object: "other", entry: [] }, ["123"])).toEqual([]);
    expect(parseWhatsAppDeliveryEvents(null, ["123"])).toEqual([]);
  });
});
