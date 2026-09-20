/**
 * Cloudinary environment contract (Phase 4F1 — Admin Parfums media).
 *
 * Same shape as src/lib/supabase/env.ts: the API secret is what signs an
 * upload authorization and must never leave the server, so it has no
 * NEXT_PUBLIC_ variant — env-contract.test.ts already fails the build if one
 * ever appears. The cloud name and API key are not secrets (Cloudinary's own
 * signed-upload model assumes both are visible to the browser — the upload
 * request itself carries the API key in plain text), but they are still read
 * server-side only here because every caller of this module already is one:
 * the browser never talks to Cloudinary with a raw key, only with the
 * short-lived signature a Server Action hands it.
 */

export type CloudinaryEnv = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

/** Returns null (never throws) when Cloudinary isn't configured — callers
 * render an honest "not configured" state instead of crashing the page. */
export function readCloudinaryEnv(): CloudinaryEnv | null {
  if (typeof window !== "undefined") {
    throw new Error("readCloudinaryEnv() must never run in the browser.");
  }
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret };
}
