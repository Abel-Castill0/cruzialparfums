import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import { LegacyCatalogRepository } from "@/domains/catalog/legacy-catalog-repository";
import { readParfumsPublicContact } from "@/domains/catalog/public-contact-repository";
import { SupabasePublicCatalogRepository } from "@/domains/catalog/supabase-public-catalog-repository";
import type { PublicProductRow } from "@/domains/catalog/supabase-public-catalog-repository";
import type { CatalogProduct, PublicCatalogRepository } from "@/domains/catalog/types";
import { PARFUMS_SETTINGS, type BusinessUnitSettings } from "@/domains/platform/settings";
import {
  buildWholesaleOffers,
  mapWholesalePolicies,
  type WholesaleOffer,
  type WholesalePolicy,
  type WholesalePolicyRow,
} from "@/domains/wholesale/wholesale-offer";
import { PARFUMS_BUSINESS_UNIT_ID } from "@/domains/catalog/supabase-public-catalog-repository";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";
import { PARFUMS_CATALOG_CACHE_TAG, PARFUMS_CATALOG_REVALIDATE_SECONDS } from "./parfums-storefront-cache";

/**
 * Cruzial Parfums public read model — Supabase is the commercial authority.
 *
 * Every /parfums page and the checkout Server Action read through here, so
 * there is exactly one place that decides what the storefront sees:
 *
 * - `supabase`: the published, price-confirmed catalog, RLS-bound anon read,
 *   plus the `public_contact` setting Admin maintains. This is the only
 *   source production ever serves.
 * - `unavailable`: Supabase is configured but the read failed. The pages
 *   render an honest "catálogo no disponible" state with an empty catalog —
 *   never stale legacy prices as a silent substitute.
 * - `legacy_fixture`: Supabase is NOT configured at all (local development
 *   or unit tests without an environment). The legacy `assets/data.js`
 *   fixture keeps the UI renderable; it is never used when an environment
 *   exists, so it cannot leak into a deployed build by accident.
 *
 * Freshness: the raw rows are held in the Next data cache for
 * PARFUMS_CATALOG_REVALIDATE_SECONDS (tag PARFUMS_CATALOG_CACHE_TAG, so an
 * admin mutation can invalidate immediately), and `cache()` dedupes the
 * composed read within one request (layout + page + metadata all call this).
 */


export type ParfumsStorefrontSource = "supabase" | "legacy_fixture" | "unavailable";

export type ParfumsStorefront = {
  source: ParfumsStorefrontSource;
  catalog: PublicCatalogRepository;
  contact: BusinessUnitSettings;
  wholesale: { offers: WholesaleOffer[]; policies: WholesalePolicy[] };
};

class EmptyCatalogRepository implements PublicCatalogRepository {
  list(): CatalogProduct[] { return []; }
  listFragrances(): CatalogProduct[] { return []; }
  listCombos(): CatalogProduct[] { return []; }
  listFeatured(): CatalogProduct[] { return []; }
  findByLegacyId(): CatalogProduct | null { return null; }
  findBySlug(): CatalogProduct | null { return null; }
  findByProductId(): CatalogProduct | null { return null; }
  resolveCartIdentity(): CatalogProduct | null { return null; }
  listRelated(): CatalogProduct[] { return []; }
}

type StorefrontData = {
  rows: PublicProductRow[];
  contact: BusinessUnitSettings | null;
  policies: WholesalePolicyRow[];
};

/** Anonymous, cookie-free read: safe to share across requests and visitors. */
const readStorefrontData = unstable_cache(
  async (): Promise<StorefrontData> => {
    const supabase = createSupabasePublicServerClient();
    if (!supabase) throw new Error("Supabase is not configured");
    const [rows, contact, policies] = await Promise.all([
      SupabasePublicCatalogRepository.fetchPublicRows(supabase),
      readParfumsPublicContact(supabase).catch(() => null),
      supabase
        .from("wholesale_policies")
        .select("scope, commercial_type, name, min_quantity, discount_amount, currency, is_active, archived_at")
        .eq("business_unit_id", PARFUMS_BUSINESS_UNIT_ID)
        .then(({ data, error }) => (error ? [] : data ?? [])),
    ]);
    return { rows, contact, policies };
  },
  ["parfums-storefront-data"],
  { revalidate: PARFUMS_CATALOG_REVALIDATE_SECONDS, tags: [PARFUMS_CATALOG_CACHE_TAG] },
);

async function loadFromSupabase(): Promise<ParfumsStorefront | null> {
  if (!createSupabasePublicServerClient()) return null;

  try {
    const { rows, contact, policies } = await readStorefrontData();
    const catalog = SupabasePublicCatalogRepository.fromPublicRows(rows);
    const wholesalePolicies = mapWholesalePolicies(policies);
    return {
      source: "supabase",
      catalog,
      contact: contact ?? PARFUMS_SETTINGS,
      wholesale: {
        offers: buildWholesaleOffers(catalog.listFragrances(), wholesalePolicies),
        policies: wholesalePolicies,
      },
    };
  } catch (error) {
    // Operational signal only: no request data, no secrets, no PII.
    console.error("[parfums-storefront] public catalog read failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return {
      source: "unavailable",
      catalog: new EmptyCatalogRepository(),
      contact: PARFUMS_SETTINGS,
      wholesale: { offers: [], policies: [] },
    };
  }
}

function loadLegacyFixture(): ParfumsStorefront {
  const catalog = new LegacyCatalogRepository();
  return {
    source: "legacy_fixture",
    catalog,
    contact: PARFUMS_SETTINGS,
    // Legacy `unit/m4/m12` tiers were never client-confirmed; the fixture
    // fallback shows no wholesale offers rather than unverified prices.
    wholesale: { offers: [], policies: [] },
  };
}

export const loadParfumsStorefront = cache(async (): Promise<ParfumsStorefront> => {
  return (await loadFromSupabase()) ?? loadLegacyFixture();
});
