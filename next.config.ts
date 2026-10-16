import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// HTML pages get a per-request nonce-based Content-Security-Policy from src/middleware.ts.
// API responses (JSON, files, receipts) get a locked-down policy here instead.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const apiCsp = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: apiCsp }] },
    ];
  },
};

export default nextConfig;
