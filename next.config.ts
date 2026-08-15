import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server serve its JS bundle to phones on the same wifi
  // network, so testing on a real phone during local development works.
  // The Mac's own LAN IP changes across networks (home, yacht club, etc.),
  // and hardcoding one address here meant every network switch silently
  // broke this -- the page itself would load, but its JS chunks got
  // blocked, so the app looked stuck on "Loading..." forever with no
  // visible error (this exact symptom hit real use, twice). Next only
  // supports DNS-style wildcards here (one `*` per dot-separated segment,
  // confirmed by reading node_modules/next/dist/server/app-render/
  // csrf-protection.js -- there is no CIDR support, `/16` notation would
  // silently never match), so this covers the whole 192.168.0.0/16
  // private range without needing an update+restart per network.
  allowedDevOrigins: ["192.168.*.*"],
};

export default nextConfig;
