import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { ADMIN_COOKIE, COOKIE } from "../config/constants";
import { env } from "../config/env";
import type { AppEnv } from "../http/types";
import { fail } from "../lib/http-error";
import { clientIp, rateLimitIpKey } from "../lib/net";
import { verifyAccessToken } from "../lib/tokens";

/**
 * In-memory SLIDING-WINDOW limiter (per namespace, per principal) — a weighted
 * two-bucket approximation (P7, PLAN.md), not a fixed window and not a stored
 * list of hit timestamps (a burst-heavy key must not grow memory unboundedly).
 *
 * Each key holds a CURRENT fixed sub-window count plus the PREVIOUS
 * sub-window's count. The estimated rate is:
 *
 *   estimate = prevCount * (1 - elapsedInCurrentSubWindow / windowMs) + currCount
 *
 * i.e. the previous sub-window's weight decays linearly as the current one
 * fills up (it assumes requests were spread evenly across it — the standard
 * approximation, not exact, but O(1) memory per key and good enough to close
 * the classic fixed-window gap: 2×max landing in a burst that straddles a
 * window boundary — max at 23:59:59.9 immediately followed by a fresh max at
 * 00:00:00.1, which a fixed window allows outright and this does not (see
 * `test/middleware/rate-limit.test.ts`).
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
 * Redis (see PLAN.md › sécurité) — the day there's a 2ᵉ API instance, this
 * whole in-memory store needs to move there anyway. Cleanup runs unref'd so it
 * never keeps the process alive.
 */
interface Bucket {
  /** The window size this bucket was created with (bounds cleanup + weighting). */
  windowMs: number;
  /** Start (ms epoch) of the CURRENT fixed sub-window. */
  currStart: number;
  currCount: number;
  /** Count from the immediately preceding sub-window (0 once it's stale). */
  prevCount: number;
}

const store = new Map<string, Bucket>();

// A bucket idle for ≥ 2 of its own windows can no longer influence any
// estimate (both its current and previous counts have fully decayed) — safe
// to drop. Bounds the map to actually-active keys, same intent as the old
// fixed-window cleanup.
const STALE_WINDOW_MULTIPLIER = 2;

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of store) {
    if (now - bucket.currStart > bucket.windowMs * STALE_WINDOW_MULTIPLIER) store.delete(key);
  }
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
  if (!bucket || now - bucket.currStart >= windowMs) {
    if (bucket && now - bucket.currStart < windowMs * STALE_WINDOW_MULTIPLIER) {
      // Exactly one sub-window elapsed since the last hit: promote its count
      // to "previous" so its trailing weight still counts against the new one.
      bucket = {
        windowMs,
        currStart: bucket.currStart + windowMs,
        currCount: 0,
        prevCount: bucket.currCount,
      };
    } else {
      // First hit ever for this key, or it's been idle ≥ 2 windows: nothing
      // from before is still inside the lookback.
      bucket = { windowMs, currStart: now, currCount: 0, prevCount: 0 };
    }
    store.set(id, bucket);
  }

  bucket.currCount += 1;
  const elapsedInCurrent = now - bucket.currStart;
  const weight = Math.max(0, (windowMs - elapsedInCurrent) / windowMs);
  const estimated = bucket.prevCount * weight + bucket.currCount;
  const resetInMs = windowMs - elapsedInCurrent;
  return {
    limited: estimated > max,
    remaining: Math.max(0, Math.floor(max - estimated)),
    resetIn: Math.ceil(resetInMs / 1000),
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
