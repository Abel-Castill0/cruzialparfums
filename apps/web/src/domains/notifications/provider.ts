import "server-only";

export const NOTIFICATION_EVENTS = [
  "order_received", "order_confirmed", "order_cancelled", "order_fulfilled",
  "complaint_received", "complaint_approaching", "complaint_overdue", "complaint_resolved",
] as const;
export type NotificationEvent = typeof NOTIFICATION_EVENTS[number];
export type NotificationUnit = "parfums" | "import";
export type NotificationMessage = {
  event: string;
  recipient: string;
  reference: string;
  idempotencyKey: string;
};
export type SendOutcome =
  | { status: "sent"; providerMessageId: string }
  | { status: "blocked" | "failed" | "retry" | "uncertain"; error: string };
export interface NotificationProvider {
  ready(event: string): boolean;
  send(message: NotificationMessage): Promise<SendOutcome>;
}
type Template = { name: string; language: string };
type Environment = Record<string, string | undefined>;
type WhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  graphVersion: string;
  templates: Partial<Record<NotificationEvent, Template>>;
};

function templates(raw: string | undefined): Partial<Record<NotificationEvent, Template>> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const source = parsed as Record<string, unknown>;
    const result: Partial<Record<NotificationEvent, Template>> = {};
    for (const event of NOTIFICATION_EVENTS) {
      const value = source[event];
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const item = value as Record<string, unknown>;
      if (typeof item.name === "string" && /^[a-z0-9_]{1,512}$/.test(item.name)
          && typeof item.language === "string" && /^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(item.language)) {
        result[event] = { name: item.name, language: item.language };
      }
    }
    return result;
  } catch { return {}; }
}

export function readWhatsAppConfig(unit: NotificationUnit, env: Environment = process.env): WhatsAppConfig | null {
  if (typeof window !== "undefined") throw new Error("Notification configuration is server only.");
  const prefix = `WHATSAPP_${unit.toUpperCase()}`;
  const accessToken = env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = env[`${prefix}_PHONE_NUMBER_ID`]?.trim();
  const graphVersion = env.WHATSAPP_GRAPH_API_VERSION?.trim();
  if (!accessToken || !phoneNumberId || !/^\d+$/.test(phoneNumberId)
      || !graphVersion || !/^v\d+\.\d+$/.test(graphVersion)) return null;
  return { accessToken, phoneNumberId, graphVersion, templates: templates(env[`${prefix}_TEMPLATES_JSON`]) };
}

/** Readiness reports configuration presence, never a successful provider test. */
export function notificationProviderReadiness(unit: NotificationUnit, env: Environment = process.env) {
  const config = readWhatsAppConfig(unit, env);
  const coveredEvents = config ? NOTIFICATION_EVENTS.filter(event => !!config.templates[event]) : [];
  return {
    whatsapp: config && coveredEvents.length ? "configured" as const : "not_configured" as const,
    coveredEvents,
    missingEvents: NOTIFICATION_EVENTS.filter(event => !coveredEvents.includes(event)),
    webhook: !!env.WHATSAPP_APP_SECRET?.trim() && !!env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim()
      ? "configured" as const : "not_configured" as const,
    email: "not_configured" as const,
  };
}

export class DisabledEmailProvider implements NotificationProvider {
  ready(): boolean { return false; }
  async send(): Promise<SendOutcome> { return { status: "blocked", error: "provider_not_configured" }; }
}

export class WhatsAppCloudProvider implements NotificationProvider {
  constructor(
    private readonly config: WhatsAppConfig | null,
    private readonly request: typeof fetch = fetch,
  ) {}

  ready(event: string): boolean {
    const key = NOTIFICATION_EVENTS.find(value => value === event);
    return !!(key && this.config?.templates[key]);
  }

  async send(message: NotificationMessage): Promise<SendOutcome> {
    const event = NOTIFICATION_EVENTS.find(value => value === message.event);
    const template = event ? this.config?.templates[event] : undefined;
    if (!this.config || !template) return { status: "blocked", error: "provider_not_configured" };
    if (!/^[0-9]{9,15}$/.test(message.recipient) || !message.reference || message.reference.length > 100) {
      return { status: "failed", error: "recipient_unavailable" };
    }
    try {
      const response = await this.request(
        `https://graph.facebook.com/${this.config.graphVersion}/${this.config.phoneNumberId}/messages`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${this.config.accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp", to: message.recipient, type: "template",
            template: { name: template.name, language: { code: template.language },
              components: [{ type: "body", parameters: [{ type: "text", text: message.reference }] }] },
          }),
          signal: AbortSignal.timeout(8000),
        },
      );
      if (response.status === 429) return { status: "retry", error: "provider_rate_limited" };
      if (response.status >= 400 && response.status < 500) return { status: "failed", error: "provider_rejected" };
      if (!response.ok) return { status: "uncertain", error: "provider_unavailable" };
      const result: unknown = await response.json();
      const messages = result && typeof result === "object" && "messages" in result ? result.messages : null;
      const first: unknown = Array.isArray(messages) ? messages[0] : null;
      const id = first && typeof first === "object" && "id" in first ? first.id : null;
      return typeof id === "string" && id.length > 0 && id.length <= 200
        ? { status: "sent", providerMessageId: id }
        : { status: "uncertain", error: "delivery_uncertain" };
    } catch {
      // A timeout can follow provider acceptance. Automatic resend would risk
      // a duplicate, because the Cloud API send endpoint has no assumed
      // application idempotency contract.
      return { status: "uncertain", error: "provider_timeout" };
    }
  }
}
