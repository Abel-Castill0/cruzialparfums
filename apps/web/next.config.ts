import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  poweredByHeader: false,
  images: {
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
    ];
  },
};

export default nextConfig;
