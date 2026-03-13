import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/download/mac",
        destination: "https://github.com/Bbasche/verbum-ai/releases/latest/download/Verbum.dmg",
        permanent: false
      }
    ];
  }
};

export default nextConfig;
