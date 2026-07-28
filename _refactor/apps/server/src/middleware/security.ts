import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { RETRY_AFTER_HEADERS } from "@certifychain/contract/constants";
import { CSRF_HEADER } from "../config/constants";
import { env } from "../config/env";

/**
 * Rate-limit headers a cross-origin browser client must be able to READ.
 *
 * The fronts talk to this API cross-origin (`hc<AppType>(API_BASE)` → :4000, no
 * rewrite), and `Retry-After` / `RateLimit-*` are NOT CORS-safelisted: without
 * an explicit `Access-Control-Expose-Headers`, the browser strips them and
 * `ApiClientError.retryAfterSeconds` is always `undefined` — so the "Trop de
 * requêtes. Réessayez dans Xs." message (audit R6) can never fire. The list is
 * anchored on {@link RETRY_AFTER_HEADERS} — the contract-level declaration the
 * client reads from too — so the two can never drift apart. It comes from
 * `@certifychain/contract` and NOT from `@certifychain/shared/api/client`:
 * internal packages export raw sources (CLAUDE.md §3), so importing the browser
 * module here would drag `document`/`RequestInfo` into the server's typecheck.
 */
const RATE_LIMIT_EXPOSED_HEADERS: string[] = [...RETRY_AFTER_HEADERS];

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
    exposeHeaders: ["X-Request-Id", "RateLimit-Remaining", ...RATE_LIMIT_EXPOSED_HEADERS],
    maxAge: 600,
  });
  // The public read surface is rate-limited per IP too (`/log/*`, `/vc/*`), and
  // v2.md §V3-3 makes it explicitly pullable from ANY origin — a third-party
  // auditor running in a browser must be able to back off on the delay the
  // server actually returns instead of guessing one. Nothing is leaked: the
  // response carries no credentials and every non-browser client already reads
  // these headers.
  const publicReadCors = cors({
    origin: "*",
    credentials: false,
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Accept", "X-Request-Id"],
    exposeHeaders: ["X-Request-Id", ...RATE_LIMIT_EXPOSED_HEADERS],
    maxAge: 600,
  });
  return (c, next) =>
    isPublicReadPath(c.req.path) && (c.req.method === "GET" || c.req.method === "OPTIONS")
      ? publicReadCors(c, next)
      : privateCors(c, next);
};
