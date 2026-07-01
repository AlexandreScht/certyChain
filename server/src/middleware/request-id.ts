import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../http/types";
import { logger } from "../lib/logger";

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
    path: c.req.path,
    status: c.res.status,
    ms: Date.now() - start,
  });
};
