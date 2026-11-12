import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["unpdf"],
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};

export default config;
