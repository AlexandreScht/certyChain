/**
 * Minimal zero-dependency structured logger (JSON → stdout).
 * Redacts sensitive keys so secrets/PII never reach the logs.
 */

import { isSensitiveLogKey } from "./mask";

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN = process.env.NODE_ENV === "production" ? LEVELS.info : LEVELS.debug;

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
  const line = JSON.stringify({
    level,
    msg,
    time: new Date().toISOString(),
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
