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
};

export default nextConfig;
