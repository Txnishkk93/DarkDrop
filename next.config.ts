import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Allow serving files from downloads folder
  async rewrites() {
    return [
      {
        source: "/downloads/:path*",
        destination: "/api/serve/:path*",
      },
    ];
  },
};

export default nextConfig;
