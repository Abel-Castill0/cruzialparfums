import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, createCspNonce } from "./content-security-policy";

describe("Content-Security-Policy", () => {
  it("issues a fresh, base64 nonce per request", () => {
    const a = createCspNonce();
    const b = createCspNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("keeps scripts strict in production: nonce + strict-dynamic, no unsafe-inline/eval", () => {
    const csp = buildContentSecurityPolicy("abc123", { development: false });
    const script = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toMatch(/unsafe-eval/);
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
  });

  it("allows only the origins the browser really uses", () => {
    const csp = buildContentSecurityPolicy("n", { development: false });
    expect(csp).toContain("img-src 'self' data: blob: https://res.cloudinary.com");
    expect(csp).toContain("connect-src 'self' https://api.cloudinary.com");
    expect(csp).not.toMatch(/supabase\.co/);
    expect(csp).toContain("font-src 'self'");
  });

  it("relaxes only eval and websockets in development", () => {
    const csp = buildContentSecurityPolicy("n", { development: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("ws: wss:");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});
