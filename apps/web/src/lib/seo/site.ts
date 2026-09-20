import "server-only";

import { readSiteUrl } from "@/lib/supabase/env";
import { resolveIndexingPolicy, type DeploymentEnvironment } from "./indexing-policy";

/**
 * One place for "where does this deployment live and may it be indexed".
 *
 * SITE_URL is the trusted canonical origin (server env, never a request
 * header). Indexing is allowed only on the Vercel production environment
 * AND after the explicit cutover approval flag — previews and staging are
 * always noindex, and robots.txt disallows everything there.
 */
export function getSiteUrl(): URL | null {
  const raw = readSiteUrl();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.hostname === "localhost" ? url : null;
  } catch {
    return null;
  }
}

export function getDeploymentEnvironment(): DeploymentEnvironment {
  const env = process.env.VERCEL_ENV;
  return env === "production" || env === "preview" ? env : "development";
}

export function isProductionCutoverApproved(): boolean {
  return process.env.CRUZIAL_PRODUCTION_CUTOVER_APPROVED === "true";
}

export function getIndexingPolicy() {
  return resolveIndexingPolicy({
    deploymentEnvironment: getDeploymentEnvironment(),
    cutoverApproved: isProductionCutoverApproved(),
  });
}
