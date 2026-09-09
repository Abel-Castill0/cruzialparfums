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
    ],
  },
  // Minimal baseline hardening (4I2): no app page is meant to be framed by
  // another origin, and no response here should ever be MIME-sniffed into
  // executable content. This is intentionally not a full CSP — that is a
  // separate, larger effort for the dedicated security phase.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
