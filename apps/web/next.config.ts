import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Next 16 streams async generateMetadata into <body> for non-bot user agents (documented "streaming metadata").
  // The root layout's metadata is async (it reads the owner's indexing switch), so on fast routes the <title>,
  // description and robots tags landed in <body> for browsers and for tools such as Lighthouse. Treating every user
  // agent as an HTML-limited bot makes metadata block the first byte and stay in <head>. Cost: slightly higher TTFB.
  htmlLimitedBots: /.*/,
  poweredByHeader: false,
  images: {
    // 75 is the default; 60 is for full-bleed cinematic heroes (visually identical, ~30% lighter).
    // AVIF was tried and reverted: +31% cold-cache encode time and more optimizer 504s under load.
    qualities: [60, 75],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "abel-castill0.github.io",
        port: "",
        pathname: "/cruzialparfums/**",
        search: "",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        port: "",
        pathname: "/**",
        search: "",
      },
    ],
  },
  // Wholesale left the Parfums storefront. Keep legacy customer links within
  // the correct business unit; Import handles current consolidated offers.
  async redirects() {
    return [
      { source: "/parfums/mayorista", destination: "/import", permanent: false },
      { source: "/parfums/mayorista/:path*", destination: "/import", permanent: false },
    ];
  },
  // Response headers for every route. The Content-Security-Policy is set
  // per request in src/proxy.ts because it carries a nonce; everything that
  // is static lives here so it also covers assets and error responses.
  async headers() {
    const isProduction = process.env.VERCEL_ENV === "production";
    const baseline = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
      { key: "X-DNS-Prefetch-Control", value: "on" },
      // HSTS only where the canonical production host is guaranteed HTTPS;
      // previews/staging must never pin the browser to a hostname policy.
      ...(isProduction
        ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
        : []),
    ];
    return [
      { source: "/:path*", headers: baseline },
      // Authenticated surfaces carry session-bound HTML: never cacheable by
      // a shared cache or the browser's back/forward cache.
      {
        source: "/admin/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/auth/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/admin",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      // Legacy service-worker kill switch (public/sw.js): browsers must
      // re-check it on every visit so the unregistering version wins fast.
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
