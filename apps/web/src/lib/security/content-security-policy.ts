/**
 * Content-Security-Policy for every HTML response (applied by src/proxy.ts).
 *
 * Built around a per-request nonce so `script-src` never needs
 * 'unsafe-inline': Next stamps the nonce on the inline scripts it emits when
 * it sees the CSP on the incoming request. 'strict-dynamic' lets those
 * nonced scripts load Next's own chunks.
 *
 * Origins are the ones the app actually talks to from the browser:
 * - images: Cloudinary product media and self-hosted client assets (`'self'`)
 *   plus data:/blob: for next/image placeholders. The legacy GitHub Pages
 *   host stays allowed while the no-environment fixture fallback exists.
 * - connect: Cloudinary direct signed uploads from the admin media managers.
 *   The browser never talks to Supabase directly (server-only clients).
 * - fonts: next/font self-hosts Google fonts at build time, so 'self' only.
 * - styles: 'unsafe-inline' is required for React inline `style` attributes
 *   (carousel transforms, next/image sizing). Style injection is not an
 *   execution vector; scripts stay strict.
 * - forms post to Server Actions on this origin only; WhatsApp is reached by
 *   navigation, not by form submission, so `form-action 'self'` holds.
 *
 * 'unsafe-eval' is development-only (React's enhanced error stacks).
 */

const CLOUDINARY_RES = "https://res.cloudinary.com";
const CLOUDINARY_API = "https://api.cloudinary.com";
const LEGACY_MEDIA_HOST = "https://abel-castill0.github.io";

export function createCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function buildContentSecurityPolicy(
  nonce: string,
  { development = process.env.NODE_ENV === "development" }: { development?: boolean } = {},
): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${CLOUDINARY_RES} ${LEGACY_MEDIA_HOST}`,
    "font-src 'self'",
    `connect-src 'self' ${CLOUDINARY_API}${development ? " ws: wss:" : ""}`,
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
  ];
  if (!development) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
