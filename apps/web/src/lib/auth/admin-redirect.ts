const SAFE_ORIGIN = "https://admin-redirect.invalid";

/**
 * Accept only same-origin destinations inside the /admin route tree.
 *
 * URL parsing handles encoded query/hash content consistently, while the
 * pathname boundary rejects lookalikes such as /administrator. The returned
 * value is relative, so callers cannot accidentally redirect to another host.
 */
export function safeAdminRedirectPath(raw: string | null): string {
  if (!raw) return "/admin";

  let parsed: URL;
  try {
    parsed = new URL(raw, SAFE_ORIGIN);
  } catch {
    return "/admin";
  }

  if (parsed.origin !== SAFE_ORIGIN) return "/admin";
  if (parsed.pathname !== "/admin" && !parsed.pathname.startsWith("/admin/")) {
    return "/admin";
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
