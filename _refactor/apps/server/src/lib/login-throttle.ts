import { LOGIN_THROTTLE } from "../config/constants";

/**
 * Per-account login throttle with progressive lockout.
 *
 * Defense-in-depth on top of the per-IP rate limiter: even a distributed
 * attacker (many IPs) is bounded per targeted account. In-memory and therefore
 * single-instance only — back this with a shared store (Redis) before scaling
 * horizontally (security audit findings #1, #11).
 *
 * Tradeoff: keying on the submitted email lets an attacker briefly lock out a
 * known account (DoS). The window is short (15 min) and the per-IP limiter is
 * the first line of defense; acceptable for the MVP pilot.
 */
interface Bucket {
  fails: number;
  lockedUntil: number;
  lastSeen: number;
}

const buckets = new Map<string, Bucket>();
const LOCK_MS = LOGIN_THROTTLE.LOCK_SECONDS * 1000;

// GC idle, unlocked buckets so the map cannot grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (b.lockedUntil <= now && now - b.lastSeen > LOCK_MS) buckets.delete(key);
  }
}, 10 * 60_000).unref();

const keyOf = (email: string): string => email.trim().toLowerCase();

/** Remaining lockout in milliseconds, or 0 if the account is not locked. */
export function loginLockMs(email: string): number {
  const b = buckets.get(keyOf(email));
  if (!b) return 0;
  const remaining = b.lockedUntil - Date.now();
  return remaining > 0 ? remaining : 0;
}

/** Record a failed login attempt; locks the account once the threshold is hit. */
export function recordLoginFailure(email: string): void {
  const key = keyOf(email);
  const now = Date.now();
  const b = buckets.get(key) ?? { fails: 0, lockedUntil: 0, lastSeen: now };
  // A fresh window after a previous lockout has elapsed.
  if (b.lockedUntil !== 0 && b.lockedUntil <= now) b.fails = 0;
  b.fails += 1;
  b.lastSeen = now;
  if (b.fails >= LOGIN_THROTTLE.MAX_FAILS) b.lockedUntil = now + LOCK_MS;
  buckets.set(key, b);
}

/** Clear throttle state for an account after a successful login. */
export function recordLoginSuccess(email: string): void {
  buckets.delete(keyOf(email));
}
