import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../http/types";
import { logger } from "../lib/logger";

/**
 * Replaces bearer/capability tokens that live in URL path segments with a
 * `:token` placeholder so they never reach stdout. Public verify links and the
 * 180-day wallet claim token are secrets carried IN the path
 * (`/verify/:token/...`, `/auth/student/claim/:token/...`); the logger's
 * key-based PII redaction cannot mask a token embedded inside the `path` string,
 * so it must be stripped here, before logging. Anyone with log-sink access could
 * otherwise replay a claim token to hijack an unclaimed diploma's wallet binding.
 */
function redactPathTokens(path: string): string {
  return path
    .replace(/^(\/verify\/)[^/]+/, "$1:token")
    .replace(/^(\/auth\/student\/claim\/)[^/]+/, "$1:token");
}

/** Assigns/propagates a request id and logs one structured line per request. */
export const requestId = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  const id = c.req.header("x-request-id") ?? randomUUID();
  c.set("requestId", id);
  c.header("x-request-id", id);
  const start = Date.now();
  await next();
  logger.info("http.request", {
    id,
    method: c.req.method,
    path: redactPathTokens(c.req.path),
    status: c.res.status,
    ms: Date.now() - start,
  });
};
