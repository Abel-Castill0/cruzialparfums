import "server-only";

import { cache } from "react";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";
import { readSiteUrl } from "@/lib/supabase/env";
import { resolveIndexingPolicy, type DeploymentEnvironment } from "./indexing-policy";

/**
 * One place for "where does this deployment live and may it be indexed".
 *
 * SITE_URL is the trusted canonical origin (server env, never a request
 * header). Indexing is allowed only on the Vercel production environment
 * AND when the owner switched it on in the admin — previews and staging are
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

/** Emergency, deployment-level override: CRUZIAL_INDEXING_FORCE_OFF=true closes every page to crawlers. */
export function isIndexingForcedOff(): boolean {
  return process.env.CRUZIAL_INDEXING_FORCE_OFF === "true";
}

const CLOSED = { index: false, follow: false } as const;

/**
 * The owner's persisted switch (public_search_indexing_enabled(), default false) decides indexing on Production.
 * Content completeness (public_launch_ready()) is deliberately NOT consulted: missing data is an admin warning, not
 * an indexing lock. Any read failure fails closed.
 */
export const getAuthoritativeIndexingPolicy = cache(async () => {
  const deploymentEnvironment = getDeploymentEnvironment();
  const forceOff = isIndexingForcedOff();
  if (deploymentEnvironment !== "production" || forceOff) return CLOSED;
  const db = createSupabasePublicServerClient();
  if (!db) return CLOSED;
  try {
    const result = await db.rpc("public_search_indexing_enabled");
    return resolveIndexingPolicy({ deploymentEnvironment, ownerEnabled: !result.error && result.data === true, forceOff });
  } catch {
    return CLOSED;
  }
});
