import { zValidator as honoZValidator } from "@hono/zod-validator";
import type { MiddlewareHandler, ValidationTargets } from "hono";
import type { ZodSchema } from "zod";

/**
 * Drop-in replacement for `@hono/zod-validator`'s `zValidator` that routes
 * validation failures through the application's error pipeline.
 *
 * Given no hook, the upstream validator answers a failed validation with its own
 * raw `{ success: false, error: <ZodError> }` body and a `400` status. That shape
 * does NOT match our API error contract (`{ error: { code, message } }`), so the
 * web client cannot extract a usable message (`error.message` is `undefined`) and
 * the user only ever sees a generic "impossible" toast with no detail.
 *
 * By throwing the `ZodError` from the hook we defer to `onError`, which already
 * renders it as a `422` `validation_error` carrying `details = err.flatten()` —
 * a consistent, client-readable error for every validated route.
 */
export const zValidator = ((
  target: keyof ValidationTargets,
  schema: ZodSchema,
): MiddlewareHandler =>
  honoZValidator(target, schema, (result) => {
    if (!result.success) {
      throw result.error;
    }
  })) as typeof honoZValidator;
