import type { NextConfig } from "next";
import path from "node:path";

const isDev = process.env.NODE_ENV !== "production";

// Browser calls the API directly from client components → CSP must allow its origin.
const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Content-Security-Policy.
 * - `unsafe-inline` (styles) is required by Tailwind + the design system's inline `style={{}}`.
 * - `unsafe-inline`/`unsafe-eval` (scripts) is an MVP compromise; tighten later with a
 *   nonce-based CSP via middleware (tracked in PLAN.md › sécurité).
 */
const csp = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  `object-src 'none'`,
  `img-src 'self' data: blob:`,
  `font-src 'self'`,
  `style-src 'self' 'unsafe-inline'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `connect-src 'self' ${apiOrigin}`,
  `upgrade-insecure-requests`,
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // HSTS — only meaningful over HTTPS; harmless in dev.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // Lean Docker image: emits a self-contained .next/standalone server.
  output: "standalone",
  // Monorepo: trace from repo root so the standalone bundle is complete.
  outputFileTracingRoot: path.join(process.cwd()),
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
