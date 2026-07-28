/**
 * Minimal zero-dependency structured logger (JSON → stdout).
 * Redacts sensitive keys so secrets/PII never reach the logs.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { env } from "../config/env";
import { isSensitiveLogKey } from "./mask";

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
// `LOG_LEVEL` (config/env.ts) — NEVER `process.env.NODE_ENV` directly here
// (CLAUDE.md §7: config always through env.ts). `env.logLevel` already folds
// in the NODE_ENV-based default when `LOG_LEVEL` is unset.
const MIN = LEVELS[env.logLevel];

/**
 * Request-id propagation (🟢, docs/architecture.md §12.2 "propager le
 * request-id dans chaque log"). `middleware/request-id.ts` opens ONE
 * `AsyncLocalStorage` run per incoming request; every `logger.*()` call made
 * anywhere DURING that request's handling — however deep in the call stack,
 * across `await`s — automatically picks up the same `id` field below, with
 * ZERO change needed at any of the ~100 existing call sites across the
 * codebase. An explicit `id` passed by a caller (the two pre-existing call
 * sites, `error-handler.ts` and `vc.routes.ts`) still wins (see `emit`) —
 * this only fills in the field where it was previously missing.
 */
const requestContext = new AsyncLocalStorage<{ requestId: string }>();

/** Used ONLY by `middleware/request-id.ts` to open the per-request context. */
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return requestContext.run({ requestId }, fn);
}

const MAX_REDACTION_DEPTH = 8;

function redactValue(
  value: unknown,
  depth: number,
  ancestors: WeakSet<object>,
): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_REDACTION_DEPTH) return "[truncated]";
  if (ancestors.has(value)) return "[circular]";

  ancestors.add(value);

  if (Array.isArray(value)) {
    const redacted = value.map((item) => redactValue(item, depth + 1, ancestors));
    ancestors.delete(value);
    return redacted;
  }

  const out: Fields = {};
  for (const [k, v] of Object.entries(value as Fields)) {
    out[k] = isSensitiveLogKey(k)
      ? "[redacted]"
      : redactValue(v, depth + 1, ancestors);
  }
  ancestors.delete(value);
  return out;
}

/**
 * Return a JSON-serializable, recursively redacted copy suitable for logs.
 *
 * Exported so the security boundary can be tested directly. The input is never
 * mutated. Deep/circular structures are replaced instead of being returned raw:
 * returning them at the recursion limit would both leak nested secrets and make
 * `JSON.stringify` throw on cycles.
 */
export function redactLogValue(value: unknown): unknown {
  return redactValue(value, 0, new WeakSet<object>());
}

function emit(level: Level, msg: string, fields?: Fields): void {
  if (LEVELS[level] < MIN) return;
  const store = requestContext.getStore();
  // `id` auto-filled from the ambient request context — an EXPLICIT `id` in
  // `fields` (the two pre-existing call sites) still overrides it below,
  // since it is spread AFTER this default.
  const auto: Fields = store ? { id: store.requestId } : {};
  const line = JSON.stringify({
    level,
    msg,
    time: new Date().toISOString(),
    ...auto,
    ...(fields ? (redactLogValue(fields) as Fields) : {}),
  });
  // stdout for info/debug, stderr for warn/error
  if (level === "warn" || level === "error") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

export const logger = {
  debug: (msg: string, fields?: Fields) => emit("debug", msg, fields),
  info: (msg: string, fields?: Fields) => emit("info", msg, fields),
  warn: (msg: string, fields?: Fields) => emit("warn", msg, fields),
  error: (msg: string, fields?: Fields) => emit("error", msg, fields),
};
