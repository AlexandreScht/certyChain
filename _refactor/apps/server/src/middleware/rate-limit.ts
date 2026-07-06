import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { ADMIN_COOKIE, COOKIE } from "../config/constants";
import { env } from "../config/env";
import type { AppEnv } from "../http/types";
import { fail } from "../lib/http-error";
import { clientIp, rateLimitIpKey } from "../lib/net";
import { verifyAccessToken } from "../lib/tokens";

/**
 * In-memory fixed-window limiter (per namespace, per principal).
 *
 * The *principal* is deliberately not always the IP: shared egress (campus NAT,
 * carrier CGNAT) puts thousands of distinct people behind one address, so IP is
 * both too coarse (over-blocks the many for one) and too weak (an attacker
 * rotates it freely). Callers therefore key on the most specific identity they
 * have — the authenticated user (`by: "user-or-ip"`) or, from a handler, the
 * target account/email (`enforceRateLimit`). The IP path stays as a coarse
 * anti-flood backstop only.
 *
 * Sufficient for a single instance / MVP. For horizontal scaling, back this with
 * Redis (see PLAN.md › sécurité). Cleanup runs unref'd so it never keeps the
 * process alive.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of store) if (bucket.resetAt <= now) store.delete(key);
}, 60_000).unref();

interface HitResult {
  limited: boolean;
  remaining: number;
  resetIn: number;
}

/** Register one hit against `id`; pure bookkeeping, never throws. */
function hit(id: string, windowMs: number, max: number): HitResult {
  const now = Date.now();
  let bucket = store.get(id);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    store.set(id, bucket);
  }
  bucket.count += 1;
  return {
    limited: bucket.count > max,
    remaining: Math.max(0, max - bucket.count),
    resetIn: Math.ceil((bucket.resetAt - now) / 1000),
  };
}

function applyResult(c: Context<AppEnv>, max: number, r: HitResult): void {
  c.header("RateLimit-Limit", String(max));
  c.header("RateLimit-Remaining", String(r.remaining));
  c.header("RateLimit-Reset", String(r.resetIn));
  if (r.limited) {
    c.header("Retry-After", String(r.resetIn));
    throw fail.rateLimited();
  }
}

/**
 * Best-effort: resolve the authenticated subject from either realm's access
 * cookie. The token is *verified* (signature/issuer/audience/expiry) — a forged
 * cookie can never be used to mint a fresh bucket and slip past the IP ceiling.
 * Returns null for anonymous or invalid sessions (caller falls back to IP).
 */
async function resolveUser(c: Context<AppEnv>): Promise<string | null> {
  const token = getCookie(c, COOKIE.ACCESS) ?? getCookie(c, ADMIN_COOKIE.ACCESS);
  if (!token) return null;
  try {
    return (await verifyAccessToken(token)).sub;
  } catch {
    return null;
  }
}

type KeyStrategy = "ip" | "user-or-ip";

export function rateLimit(opts?: {
  windowSec?: number;
  max?: number;
  key?: string;
  /** "ip" (default) or "user-or-ip" (per authenticated user, else per IP). */
  by?: KeyStrategy;
  /** Ceiling used when the bucket falls back to IP (shared-NAT tolerance). */
  ipMax?: number;
}): MiddlewareHandler<AppEnv> {
  const windowMs = (opts?.windowSec ?? env.RATE_LIMIT_WINDOW) * 1000;
  const userMax = opts?.max ?? env.RATE_LIMIT_MAX;
  const ipMax = opts?.ipMax ?? userMax;
  const namespace = opts?.key ?? "global";
  const by: KeyStrategy = opts?.by ?? "ip";

  return async (c, next) => {
    let principal: string;
    let max: number;
    const user = by === "user-or-ip" ? await resolveUser(c) : null;
    if (user) {
      principal = `u:${user}`;
      max = userMax;
    } else {
      principal = `ip:${rateLimitIpKey(clientIp(c))}`;
      max = ipMax;
    }
    applyResult(c, max, hit(`${namespace}:${principal}`, windowMs, max));
    await next();
  };
}

/**
 * Imperative limiter for use *inside* a handler, keyed on an application-level
 * identifier (e.g. the target email or account id) rather than the IP. This is
 * the correct primary defense for auth flows: it survives shared networks and
 * IP rotation alike. Lower-cased so keying is case-insensitive (matches the
 * login throttle). Throws `fail.rateLimited()` when the window budget is spent.
 */
export function enforceRateLimit(
  c: Context<AppEnv>,
  opts: { key: string; identifier: string; max: number; windowSec: number },
): void {
  const id = `${opts.key}:id:${opts.identifier.toLowerCase()}`;
  applyResult(c, opts.max, hit(id, opts.windowSec * 1000, opts.max));
}
