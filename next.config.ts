import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  images: {
    remotePatterns: [
      {
        hostname: "images.unsplash.com",
        protocol: "https",
        port: "",
      },
      {
        hostname: "knowing-lyrebird-975.convex.cloud",
        protocol: "https",
        port: "",
      },
      {
        hostname: "shiny-pigeon-737.convex.cloud",
        protocol: "https",
      },
    ],
  },
};

export default nextConfig;
