import type { ErrorHandler, NotFoundHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import { env } from "../config/env";
import type { ApiError } from "../contract/errors";
import type { AppEnv } from "../http/types";
import { AppError } from "../lib/http-error";
import { logger } from "../lib/logger";

export const onError: ErrorHandler<AppEnv> = (err, c) => {
  if (err instanceof AppError) {
    const body: ApiError = { error: { code: err.code, message: err.message, details: err.details } };
    return c.json(body, err.status as ContentfulStatusCode);
  }
  if (err instanceof ZodError) {
    const body: ApiError = {
      error: { code: "validation_error", message: "Données invalides", details: err.flatten() },
    };
    return c.json(body, 422);
  }
  logger.error("http.unhandled", {
    id: c.get("requestId"),
    error: String(err),
    stack: env.isDev && err instanceof Error ? err.stack : undefined,
  });
  const body: ApiError = { error: { code: "internal_error", message: "Erreur interne" } };
  return c.json(body, 500);
};

export const notFoundHandler: NotFoundHandler<AppEnv> = (c) => {
  const body: ApiError = { error: { code: "not_found", message: "Route introuvable" } };
  return c.json(body, 404);
};
