import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep data fresh on every internal navigation; never prefetch private records.
  experimental: {staleTimes: {dynamic: 0, static: 0}},
};

export default nextConfig;
