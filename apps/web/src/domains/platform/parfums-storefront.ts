/**
 * Static Cruzial Parfums storefront facts that are not commercial data and
 * therefore do not live in Supabase: brand assets self-hosted by this app,
 * the decant atomization guidance shown since launch, and the public
 * Instagram handle. Contact channels (WhatsApp/email) are NOT here — they are
 * read from the `public_contact` setting so Admin edits reach the storefront.
 */

export const PARFUMS_STORE_NAME = "Cruzial Parfums";

export const PARFUMS_INSTAGRAM_URL = "https://www.instagram.com/Cruzial_parfum/";

/** Approximate sprays per decant size, as published on the legacy storefront. */
export const PARFUMS_ATOMIZATIONS: Readonly<Record<string, string>> = {
  "3": "50–60",
  "5": "70–80",
  "10": "140–150",
};

/**
 * Client-provided brand media, copied byte-for-byte from the legacy static
 * site into apps/web/public so production no longer depends on the legacy
 * GitHub Pages host being online.
 */
export const PARFUMS_BRAND_MEDIA = {
  logoUrl: "/parfums/logo-mark.png",
  heroUrl: "/parfums/hero/hero-crop.webp",
} as const;
