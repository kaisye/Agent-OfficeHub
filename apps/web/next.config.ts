import path from "node:path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

function origin(url: string | undefined, fallback: string): string {
  try {
    return new URL(url ?? fallback).origin;
  } catch {
    return new URL(fallback).origin;
  }
}

/**
 * SEC-05. Next injects inline bootstrap scripts, so script-src needs 'unsafe-inline' (no nonce pipeline yet;
 * a nonce needs dynamic rendering for every page). Dev also needs 'unsafe-eval' (React refresh) and ws: (HMR).
 * styles: Tailwind output is 'self'; inline style attributes + Google Fonts stylesheet (layout.tsx).
 */
function contentSecurityPolicy(): string {
  const api = origin(process.env.NEXT_PUBLIC_API_URL, "http://localhost:8787");
  const mcp = origin(process.env.NEXT_PUBLIC_MCP_URL, "http://localhost:8788/mcp");
  const connect = ["'self'", api, mcp, ...(isDev ? ["ws:", "wss:"] : [])];
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

const config: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
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
