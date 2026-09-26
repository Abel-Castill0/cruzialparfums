import type { MetadataRoute } from "next";
import { loadParfumsStorefront } from "@/lib/catalog/parfums-storefront";
import { getAuthoritativeIndexingPolicy, getSiteUrl } from "@/lib/seo/site";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PARFUMS_ROUTES: Array<{ path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }> = [
  { path: "/", priority: 0.6, changeFrequency: "monthly" },
  { path: "/parfums", priority: 1, changeFrequency: "weekly" },
  { path: "/parfums/catalogo", priority: 0.9, changeFrequency: "daily" },
  { path: "/parfums/combos", priority: 0.7, changeFrequency: "weekly" },
  { path: "/parfums/mayorista", priority: 0.6, changeFrequency: "weekly" },
  { path: "/parfums/finder", priority: 0.4, changeFrequency: "monthly" },
  { path: "/parfums/nosotros", priority: 0.4, changeFrequency: "monthly" },
  { path: "/parfums/contacto", priority: 0.4, changeFrequency: "monthly" },
  { path: "/parfums/privacidad", priority: 0.2, changeFrequency: "monthly" },
  { path: "/parfums/terminos", priority: 0.2, changeFrequency: "monthly" },
  { path: "/import", priority: 0.7, changeFrequency: "weekly" },
];

/**
 * Only published Parfums products and the currently public Import campaign's
 * products are listed — the same publication gates the storefront uses.
 * Empty when indexing is not allowed for this deployment.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl();
  if (!site || !(await getAuthoritativeIndexingPolicy()).index) return [];
  const url = (path: string) => new URL(path, site).toString();
  const now = new Date();

  const entries: MetadataRoute.Sitemap = PARFUMS_ROUTES.map((route) => ({
    url: url(route.path),
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const { catalog } = await loadParfumsStorefront();
  for (const product of catalog.listFragrances()) {
    entries.push({
      url: url(`/parfums/productos/${product.slug}`),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }

  const supabase = createSupabasePublicServerClient();
  if (supabase) {
    const { data } = await supabase.rpc("public_list_import_catalog", {
      p_page: 1,
      p_page_size: 200,
    });
    for (const row of (data ?? []) as Array<{ slug?: string }>) {
      if (typeof row.slug === "string" && row.slug) {
        entries.push({ url: url(`/import/producto/${row.slug}`), lastModified: now, changeFrequency: "weekly", priority: 0.6 });
      }
    }
  }

  return entries;
}
