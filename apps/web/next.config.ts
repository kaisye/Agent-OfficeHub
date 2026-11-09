import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  transpilePackages: ["@officehub/shared", "@officehub/brand", "@officehub/ui"],
  // The mock client seeds itself from docs/business/seed-tripflix.json (outside this app).
  experimental: { externalDir: true },
  // The workspace packages use ESM-style ".js" specifiers that point at ".ts(x)" sources.
  webpack(webpackConfig) {
    webpackConfig.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return webpackConfig;
  },
};

export default config;
