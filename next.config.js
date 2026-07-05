/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pg and pg-boss both do dynamic/optional requires (e.g. pg-native,
  // pg-cloudflare) that trip up Next's route-handler bundler without this.
  experimental: {
    serverComponentsExternalPackages: ["pg", "pg-boss"],
  },
};

module.exports = nextConfig;
