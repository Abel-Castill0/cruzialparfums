import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { readOrderAbuseHmacSecret } from "@/lib/supabase/env";

/**
 * Gate 2B: public order-request anti-abuse / rate limiting.
 *
 * `requestId` only protects idempotency when a caller reuses the SAME uuid —
 * a bot can mint unlimited new ones. This module is the Next.js side of the
 * authoritative, PostgreSQL-backed sliding-window limiter
 * (public.check_abuse_rate_limit, migration
 * 20260925140000_order_request_rate_limit_purpose_scope.sql). It never keeps
 * its own counters in Node memory: a serverless deployment has no single
 * process to hold them in. Every caller passes an explicit `purpose` so
 * order requests and complaint submissions never share a quota.
 *
 * Raw IP and raw phone never leave this module — only an HMAC-SHA256 hex
 * digest, keyed by a secret dedicated to this purpose
 * (ORDER_ABUSE_HMAC_SECRET), reaches the database or any log line.
 */

export type OrderAbuseBusinessUnit = "parfums" | "import";

/**
 * Gate A2: independent abuse-limit scope. Order requests and Libro de
 * Reclamaciones complaints must never share a quota — a flood of one must
 * not be able to exhaust the other's budget for the same IP/phone.
 */
export type OrderAbusePurpose = "order_request" | "complaint";

export type OrderRequestRateLimitDecision =
  | { kind: "allowed" }
  | { kind: "denied"; retryAfterSeconds: number }
  /** Secret missing or the RPC failed unexpectedly. Callers must fail closed. */
  | { kind: "unavailable" };

const HMAC_DOMAIN_PREFIX = "cruzial:order-abuse:v1";

/**
 * Resolves the network identity Vercel itself attached to the request.
 *
 * `x-vercel-forwarded-for` is set by Vercel's edge network and cannot be
 * spoofed by the client in a Vercel deployment — Vercel overwrites it before
 * the request reaches the function. In any other environment this project
 * has no configured trusted proxy, so a client-supplied
 * `x-forwarded-for`/`x-real-ip` is not trusted and IP signal is `null`;
 * phone-based limits still apply.
 *
 * Exported for direct testing without mocking `next/headers`.
 */
export function resolveTrustedRequestIp(
  headerValue: string | null,
  isVercelDeployment: boolean,
): string | null {
  if (!isVercelDeployment || !headerValue) return null;

  // Vercel prepends the original client IP; later entries are intermediate
  // proxies. Take the first, non-empty entry only.
  const first = headerValue.split(",")[0]?.trim();
  if (!first) return null;

  return isIP(first) !== 0 ? first : null;
}

/** Server-only: reads the trusted request IP for the current request, if any. */
export async function readTrustedRequestIp(): Promise<string | null> {
  const requestHeaders = await headers();
  const isVercelDeployment = Boolean(process.env.VERCEL);
  return resolveTrustedRequestIp(requestHeaders.get("x-vercel-forwarded-for"), isVercelDeployment);
}

/**
 * Canonicalizes a phone number for the anti-abuse identity key only. This is
 * NOT the order's stored phone and must never replace it: it only reduces
 * trivial variants (9-digit Peru numbers vs. their +51 form) so a bot cannot
 * dodge the phone-scoped limit by toggling the country code.
 */
export function canonicalizePhoneForAbuseKey(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 9 && digits.startsWith("9")) return `51${digits}`;
  if (digits.length === 11 && digits.startsWith("51")) return digits;

  return digits;
}

function hmacHex(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

/**
 * Exported so the IP/phone domain-separation property is directly testable:
 * the same raw value must hash differently depending on which identity it is
 * ("ip" vs "phone" is part of the HMAC input, not just the caller's label).
 * Still server-only — never imported from a client component.
 */
export function hashIpForAbuseKey(secret: string, ip: string): string {
  return hmacHex(secret, `${HMAC_DOMAIN_PREFIX}:ip:${ip}`);
}

export function hashPhoneForAbuseKey(secret: string, canonicalPhone: string): string {
  return hmacHex(secret, `${HMAC_DOMAIN_PREFIX}:phone:${canonicalPhone}`);
}

export type CheckOrderRequestRateLimitInput = {
  client: SupabaseClient<Database>;
  purpose: OrderAbusePurpose;
  businessUnit: OrderAbuseBusinessUnit;
  requestId: string;
  /** Raw phone as entered by the customer; canonicalized and hashed here. */
  phone: string;
};

/**
 * Checks (and, if admitted, consumes) rate-limit quota for a new public order
 * request. Call this AFTER shape/business validation and BEFORE the
 * persistence RPC. A retried, previously-admitted `requestId` is always
 * allowed again without consuming quota — the persistence RPC's own
 * idempotency then returns the existing order.
 *
 * Fails closed: a missing secret or an unexpected RPC error both return
 * `{ kind: "unavailable" }`, which callers must treat as "do not create the
 * order" with a generic message. Never logs raw IP, raw phone, or the HMAC
 * secret; logs only the business unit and error code.
 */
export async function checkOrderRequestRateLimit(
  input: CheckOrderRequestRateLimitInput,
): Promise<OrderRequestRateLimitDecision> {
  const secret = readOrderAbuseHmacSecret();
  if (!secret) {
    console.error("[order-abuse] ORDER_ABUSE_HMAC_SECRET is not configured; failing closed.", {
      businessUnit: input.businessUnit,
    });
    return { kind: "unavailable" };
  }

  const ip = await readTrustedRequestIp();
  const ipHash = ip ? hashIpForAbuseKey(secret, ip) : null;
  const phoneHash = hashPhoneForAbuseKey(secret, canonicalizePhoneForAbuseKey(input.phone));

  const { data, error } = await input.client.rpc("check_abuse_rate_limit", {
    p_purpose: input.purpose,
    p_business_unit_code: input.businessUnit,
    p_request_id: input.requestId,
    p_ip_hash: ipHash as unknown as string,
    p_phone_hash: phoneHash,
  });

  if (error) {
    console.error("[order-abuse] rate-limit RPC failed; failing closed.", {
      purpose: input.purpose,
      businessUnit: input.businessUnit,
      requestId: input.requestId,
      errorCode: error.code,
    });
    return { kind: "unavailable" };
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result) {
    console.error("[order-abuse] rate-limit RPC returned no row; failing closed.", {
      purpose: input.purpose,
      businessUnit: input.businessUnit,
      requestId: input.requestId,
    });
    return { kind: "unavailable" };
  }

  if (!result.allowed) {
    return { kind: "denied", retryAfterSeconds: result.retry_after_seconds ?? 60 };
  }

  return { kind: "allowed" };
}
