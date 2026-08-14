import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server serve its JS bundle to phones on the same wifi
  // network, so testing on a real phone during local development works.
  allowedDevOrigins: ["192.168.0.5"],
};

export default nextConfig;
