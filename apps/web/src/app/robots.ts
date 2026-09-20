import type { MetadataRoute } from "next";
import { getIndexingPolicy, getSiteUrl } from "@/lib/seo/site";

export const dynamic = "force-dynamic";

/**
 * Previews, staging and any deployment without the explicit cutover flag
 * are closed to crawlers entirely. Production after cutover opens the public
 * storefronts and keeps the private/transactional surfaces out.
 */
export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl();
  if (!getIndexingPolicy().index) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/auth",
        "/parfums/checkout",
        "/parfums/gracias",
        "/import/carrito",
        "/import/checkout",
      ],
    },
    ...(site ? { sitemap: new URL("/sitemap.xml", site).toString(), host: site.origin } : {}),
  };
}
