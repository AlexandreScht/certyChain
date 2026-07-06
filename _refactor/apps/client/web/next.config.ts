import type { NextConfig } from "next";
import path from "node:path";
import { buildSecurityHeaders } from "../../../packages/shared/src/config/security-headers";

const isDev = process.env.NODE_ENV !== "production";

// Browser calls the API directly from client components → CSP must allow its origin.
const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Public web surface: indexable, default referrer policy.
const securityHeaders = buildSecurityHeaders({ apiOrigin, isDev });

const nextConfig: NextConfig = {
  // Lean Docker image: emits a self-contained .next/standalone server.
  output: "standalone",
  // Monorepo: trace from the workspace root (3 levels up) so the standalone
  // bundle includes the workspace packages (shared/contract).
  outputFileTracingRoot: path.join(process.cwd(), "../../.."),
  // No-build-step workspace packages: Next transpiles their raw .ts/.tsx.
  transpilePackages: ["@certifychain/shared", "@certifychain/contract"],
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
