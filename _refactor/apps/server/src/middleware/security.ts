import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { CSRF_HEADER } from "../config/constants";
import { env } from "../config/env";

/** Public artifacts fetched by third-party/native wallets without cookies. */
export function isPublicVcReadPath(path: string): boolean {
  return (
    path === "/.well-known/openid-credential-issuer" ||
    path === "/.well-known/oauth-authorization-server" ||
    path === "/.well-known/jwt-vc-issuer" ||
    /^\/vc\/offers\/[^/]+\/?$/.test(path) ||
    /^\/vc\/status\/[^/]+\/?$/.test(path)
  );
}

/**
 * Public read surface served with wildcard CORS (no credentials) + cross-origin
 * CORP: the EUDI discovery artifacts AND the transparency log (`/log/*`, v2.md
 * §V3-3), which is designed to be pulled and audited from ANY origin.
 */
export function isPublicReadPath(path: string): boolean {
  return isPublicVcReadPath(path) || /^\/log\/[^/]+/.test(path);
}

/** Hardened response headers (the API serves JSON, so the CSP is restrictive). */
export const securityHeaders = (): MiddlewareHandler => {
  const hardened = secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
    },
    strictTransportSecurity: "max-age=63072000; includeSubDomains; preload",
    xFrameOptions: "DENY",
    xContentTypeOptions: "nosniff",
    referrerPolicy: "no-referrer",
    crossOriginOpenerPolicy: "same-origin",
    // Added dynamically below: public wallet artifacts must be embeddable by
    // another origin, while every private API response remains same-origin.
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
  });
  return async (c, next) => {
    const result = await hardened(c, next);
    c.header(
      "Cross-Origin-Resource-Policy",
      c.req.method === "GET" && isPublicReadPath(c.req.path)
        ? "cross-origin"
        : "same-origin",
    );
    return result;
  };
};

/**
 * Credentialed app CORS stays allow-listed. Public wallet discovery resources
 * use wildcard/no-credentials, as required for independent EUDI clients.
 */
export const corsMiddleware = (): MiddlewareHandler => {
  const privateCors = cors({
    origin: env.corsOrigins,
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", CSRF_HEADER, "X-Request-Id"],
    exposeHeaders: ["X-Request-Id", "RateLimit-Remaining"],
    maxAge: 600,
  });
  const publicReadCors = cors({
    origin: "*",
    credentials: false,
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Accept", "X-Request-Id"],
    exposeHeaders: ["X-Request-Id"],
    maxAge: 600,
  });
  return (c, next) =>
    isPublicReadPath(c.req.path) && (c.req.method === "GET" || c.req.method === "OPTIONS")
      ? publicReadCors(c, next)
      : privateCors(c, next);
};
