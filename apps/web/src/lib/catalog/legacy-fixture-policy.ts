/**
 * When may the Parfums storefront render the committed legacy fixture?
 *
 * The fixture carries unverified legacy prices (bottle prices in particular
 * were never confirmed), so it exists only to keep a cold local checkout
 * renderable. Any deployed build (Vercel Production or Preview) that lost its
 * Supabase variables must fail closed with the honest "catálogo no
 * disponible" state instead of silently publishing those prices.
 *
 * `VERCEL` is set by the platform on every deployment and never locally.
 */
export function mayServeLegacyFixture(env: Readonly<Record<string, string | undefined>>): boolean {
  return !env.VERCEL;
}
