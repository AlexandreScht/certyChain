import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import type { AppEnv } from "../../src/http/types";
import { rateLimitIpKey } from "../../src/lib/net";
import { onError } from "../../src/middleware/error-handler";
import { enforceRateLimit, rateLimit } from "../../src/middleware/rate-limit";

describe("rateLimitIpKey", () => {
  it("keeps the full IPv4 address (a /24 would over-block a whole ISP block)", () => {
    assert.equal(rateLimitIpKey("203.0.113.7"), "203.0.113.7");
  });

  it("collapses an IPv6 /64 to one bucket (no intra-prefix rotation evasion)", () => {
    assert.equal(
      rateLimitIpKey("2001:db8:abcd:1::1"),
      rateLimitIpKey("2001:db8:abcd:1:ffff::99"),
    );
    assert.equal(rateLimitIpKey("2001:db8:abcd:1::1"), "2001:db8:abcd:1::/64");
  });

  it("distinguishes different /64 prefixes", () => {
    assert.notEqual(
      rateLimitIpKey("2001:db8:abcd:1::1"),
      rateLimitIpKey("2001:db8:abcd:2::1"),
    );
  });
});

describe("enforceRateLimit (keyed on the account, not the IP)", () => {
  const app = new Hono<AppEnv>();
  app.onError(onError);
  app.post("/t", (c) => {
    enforceRateLimit(c, {
      key: "test_acct",
      identifier: c.req.query("id") ?? "x",
      max: 2,
      windowSec: 60,
    });
    return c.json({ ok: true });
  });
  const hit = (id: string) => app.request(`/t?id=${id}`, { method: "POST" });

  it("allows up to `max`, then 429 — for the SAME identifier", async () => {
    assert.equal((await hit("alice")).status, 200);
    assert.equal((await hit("alice")).status, 200);
    const blocked = await hit("alice");
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get("Retry-After"));
  });

  it("buckets identifiers independently — a shared IP can't starve others", async () => {
    // 'alice' is exhausted above; a different account is wholly unaffected.
    assert.equal((await hit("bob")).status, 200);
  });

  it("is case-insensitive on the identifier", async () => {
    await hit("Carol");
    await hit("carol");
    assert.equal((await hit("CAROL")).status, 429);
  });

  it("exposes RateLimit-* headers", async () => {
    const res = await hit("dave");
    assert.equal(res.headers.get("RateLimit-Limit"), "2");
    assert.equal(res.headers.get("RateLimit-Remaining"), "1");
  });
});

describe("rateLimit middleware (coarse IP backstop)", () => {
  it("blocks once the IP ceiling is exceeded", async () => {
    const app = new Hono<AppEnv>();
    app.onError(onError);
    app.use("*", rateLimit({ key: "test_ip", by: "ip", ipMax: 2, windowSec: 60 }));
    app.get("/p", (c) => c.json({ ok: true }));
    assert.equal((await app.request("/p")).status, 200);
    assert.equal((await app.request("/p")).status, 200);
    assert.equal((await app.request("/p")).status, 429);
  });
});
