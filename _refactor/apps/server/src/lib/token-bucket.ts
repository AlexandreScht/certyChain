/**
 * Minimal in-memory token bucket for OUTBOUND calls to third-party APIs
 * (SIRENE/Gemini — `lib/insee.ts` / `lib/gemini.ts`). Single-instance MVP,
 * same assumption as the inbound limiter (`middleware/rate-limit.ts`): the
 * day there is a 2ᵉ API instance, this needs to move to a shared store (e.g.
 * Redis) — two instances would otherwise each keep their own budget and
 * double the effective ceiling against the provider.
 *
 * Classic token bucket, not a sliding window: tokens refill continuously at
 * `refillPerSec`, capped at `capacity` — this tolerates a short burst up to
 * the full capacity (e.g. right after a cold start) while still bounding the
 * long-run average rate, which better matches how third-party API quotas are
 * usually enforced (a per-second/per-minute rate, not a strict inbound-style
 * request budget).
 *
 * ⚠️ Both integrations this protects are ALREADY optional and degrade
 * cleanly without an API key (`env.inseeConfigured` / `env.geminiConfigured`
 * gate them upstream) — `tryConsume()` returning `false` must be treated
 * EXACTLY like "no key configured": the caller returns `null` and the
 * feature falls back (manual review / plausibility scoring), it NEVER
 * throws or otherwise fails the inbound user request that triggered the
 * optional call.
 */
export interface TokenBucket {
  /** Attempts to consume one token. `false` (never a throw) once the bucket
   *  is empty — the caller decides how to degrade. */
  tryConsume: () => boolean;
}

export function createTokenBucket(
  opts: { capacity: number; refillPerSec: number },
  /** Injectable clock (tests only) — production callers always omit it. */
  now: () => number = Date.now,
): TokenBucket {
  const { capacity, refillPerSec } = opts;
  let tokens = capacity;
  let lastRefillMs = now();

  function refill(): void {
    const at = now();
    const elapsedSec = (at - lastRefillMs) / 1000;
    if (elapsedSec <= 0) return;
    tokens = Math.min(capacity, tokens + elapsedSec * refillPerSec);
    lastRefillMs = at;
  }

  return {
    tryConsume(): boolean {
      refill();
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
}
