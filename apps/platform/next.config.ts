import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16 uses Turbopack by default. Configure properly for HMR behind proxy.
  turbopack: {},

  // If you need to configure HMR host for proxied environments, ensure this is set as env var
  // The frontend will use HMR_HOST, HMR_PORT, HMR_PROTOCOL env vars passed from docker-compose
};

export default nextConfig;
