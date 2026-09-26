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

/** An incorrect approval flag cannot bypass missing factual business data. */
export const getAuthoritativeIndexingPolicy = cache(async () => {
 const policy=getIndexingPolicy(); if(!policy.index)return policy;
 const db=createSupabasePublicServerClient();if(!db)return {index:false,follow:false} as const;
 try{const result=await db.rpc("public_launch_ready");return !result.error&&result.data===true?policy:{index:false,follow:false} as const;}
 catch{return {index:false,follow:false} as const;}
});
