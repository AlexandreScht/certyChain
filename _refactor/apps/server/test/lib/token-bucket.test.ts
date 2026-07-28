/**
 * `lib/token-bucket.ts` — outbound rate limiter for SIRENE/Gemini
 * (`config/constants.ts#OUTBOUND_RATE_LIMIT`). Uses the injectable clock so
 * refill can be exercised deterministically, without real sleeps.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTokenBucket } from "../../src/lib/token-bucket";

describe("createTokenBucket", () => {
  it("allows up to `capacity` consumes, then refuses (no throw)", () => {
    let clock = 0;
    const bucket = createTokenBucket({ capacity: 3, refillPerSec: 0 }, () => clock);
    assert.equal(bucket.tryConsume(), true);
    assert.equal(bucket.tryConsume(), true);
    assert.equal(bucket.tryConsume(), true);
    assert.equal(bucket.tryConsume(), false);
    assert.equal(bucket.tryConsume(), false); // stays false, never throws
  });

  it("refills over time, capped at `capacity` (never overshoots on a long idle gap)", () => {
    let clock = 0;
    const bucket = createTokenBucket({ capacity: 2, refillPerSec: 1 }, () => clock);
    assert.equal(bucket.tryConsume(), true);
    assert.equal(bucket.tryConsume(), true);
    assert.equal(bucket.tryConsume(), false); // empty

    clock += 500; // 0.5s → +0.5 token, still < 1
    assert.equal(bucket.tryConsume(), false);

    clock += 600; // +0.6s more (1.1s total) → +1.1 tokens ≥ 1
    assert.equal(bucket.tryConsume(), true);
    assert.equal(bucket.tryConsume(), false); // only ~0.1 left, not enough for a 2nd

    clock += 10_000; // huge idle gap
    assert.equal(bucket.tryConsume(), true);
    assert.equal(bucket.tryConsume(), true);
    assert.equal(bucket.tryConsume(), false); // capped at capacity=2, not unbounded
  });

  it("two independent buckets never share state", () => {
    let clock = 0;
    const a = createTokenBucket({ capacity: 1, refillPerSec: 0 }, () => clock);
    const b = createTokenBucket({ capacity: 1, refillPerSec: 0 }, () => clock);
    assert.equal(a.tryConsume(), true);
    assert.equal(a.tryConsume(), false);
    // `b` is unaffected by `a` having been drained.
    assert.equal(b.tryConsume(), true);
  });
});
