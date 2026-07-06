import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { CSRF_HEADER } from "../config/constants";
import { env } from "../config/env";

/** Hardened response headers (the API serves JSON, so the CSP is restrictive). */
export const securityHeaders = (): MiddlewareHandler =>
  secureHeaders({
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
    crossOriginResourcePolicy: "same-origin",
    crossOriginEmbedderPolicy: false,
  });

/** Strict, credentialed CORS limited to the configured web origins. */
export const corsMiddleware = (): MiddlewareHandler =>
  cors({
    origin: env.corsOrigins,
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", CSRF_HEADER, "X-Request-Id"],
    exposeHeaders: ["X-Request-Id", "RateLimit-Remaining"],
    maxAge: 600,
  });
