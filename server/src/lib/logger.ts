/**
 * Minimal zero-dependency structured logger (JSON → stdout).
 * Redacts sensitive keys so secrets/PII never reach the logs.
 */

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN = process.env.NODE_ENV === "production" ? LEVELS.info : LEVELS.debug;

const REDACT_KEYS = new Set(
  [
    "password",
    "passwordhash",
    "privatekey",
    "encryptedprivatekey",
    "encryptedholdersecret",
    "holdersecret",
    "secret",
    "token",
    "refreshtoken",
    "accesstoken",
    "codehash",
    "otp",
    "authorization",
    "cookie",
    "set-cookie",
    "masterkey",
    "master_enc_key",
    "otp_pepper",
  ].map((k) => k.toLowerCase()),
);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Fields = {};
  for (const [k, v] of Object.entries(value as Fields)) {
    out[k] = REDACT_KEYS.has(k.toLowerCase()) ? "[redacted]" : redact(v, depth + 1);
  }
  return out;
}

function emit(level: Level, msg: string, fields?: Fields): void {
  if (LEVELS[level] < MIN) return;
  const line = JSON.stringify({
    level,
    msg,
    time: new Date().toISOString(),
    ...(fields ? (redact(fields) as Fields) : {}),
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
