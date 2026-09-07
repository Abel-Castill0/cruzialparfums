import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readSupabasePublicEnv } from "./env";

/**
 * Session refresh for the proxy (this Next.js version's middleware).
 *
 * @supabase/ssr's own docs are blunt about this: pages and Server Components
 * often cannot write cookies, so if the proxy does not refresh the session and
 * write the rotated tokens back, users get random logouts and hard-to-debug
 * auth failures. This is that refresh.
 *
 * The `headers` argument of `setAll` is not optional detail — it carries
 * `Cache-Control: private, no-store` and friends. Dropping it would let a CDN
 * cache a response containing one user's auth cookie and serve it to someone
 * else, so it is copied onto the response verbatim.
 */
export async function refreshSupabaseSession(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse> {
  const env = readSupabasePublicEnv();
  // No backend configured yet: the storefront still runs off the legacy
  // fixture, so this is a no-op rather than an error.
  if (!env) return response;

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Touching the session is what triggers a refresh when the access token is
  // near expiry; the result is intentionally unused here. Authorization
  // happens in the page/handler via getAdminSession(), never in the proxy —
  // a proxy that redirects is a convenience, not a security boundary.
  await supabase.auth.getUser();

  return response;
}
