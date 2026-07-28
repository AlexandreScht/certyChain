/**
 * CORS — the headers the API actually EXPOSES to a cross-origin browser.
 *
 * Why this lives server-side: the fronts call the API cross-origin
 * (`hc<AppType>(API_BASE)` → :4000, no Next rewrite), and a browser hands
 * `res.headers.get(...)` only the CORS-safelisted headers PLUS whatever
 * `Access-Control-Expose-Headers` names. A client-side spec that mocks
 * `headers.get` proves the parsing and nothing else — it stays green while the
 * value is invisible in a real browser. So the guarantee has to be asserted on
 * the real `corsMiddleware()`, against the real 429 the real rate limiter
 * produces, on BOTH CORS surfaces (credentialed app + wildcard public read).
 *
 * `RETRY_AFTER_HEADERS` is read from `@certifychain/contract` — the same
 * declaration `unwrap` consumes — so adding a header to the client's read order
 * automatically tightens this test instead of silently escaping it.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import { RETRY_AFTER_HEADERS } from "@certifychain/contract/constants";
import { env } from "../../src/config/env";
import type { AppEnv } from "../../src/http/types";
import { onError } from "../../src/middleware/error-handler";
import { rateLimit } from "../../src/middleware/rate-limit";
import { corsMiddleware, isPublicReadPath } from "../../src/middleware/security";

const APP_ORIGIN = env.corsOrigins[0];
/** A public read path (v2.md §V3-3): the transparency log, pullable anywhere. */
const PUBLIC_PATH = "/log/checkpoint";
/** Any other path goes through the credentialed, allow-listed CORS. */
const PRIVATE_PATH = "/wallet/diplomas";

/** Real middleware stack, with a bucket small enough to exhaust in two calls. */
function makeApp(key: string) {
  const app = new Hono<AppEnv>();
  app.onError(onError);
  app.use("*", corsMiddleware());
  app.use("*", rateLimit({ key, by: "ip", ipMax: 1, windowSec: 60 }));
  app.get("*", (c) => c.json({ ok: true }));
  return app;
}

/** Exhausts the bucket and returns the resulting 429, sent from `origin`. */
async function get429(app: Hono<AppEnv>, path: string, origin: string): Promise<Response> {
  const headers = { Origin: origin };
  await app.request(path, { headers });
  const res = await app.request(path, { headers });
  assert.equal(res.status, 429, "the bucket must actually be exhausted");
  return res;
}

/** `Access-Control-Expose-Headers` as a lower-cased set (the list is comma-joined). */
function exposedHeaders(res: Response): Set<string> {
  const raw = res.headers.get("Access-Control-Expose-Headers") ?? "";
  return new Set(raw.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean));
}

describe("corsMiddleware — retry delay is readable cross-origin (audit R6)", () => {
  it("routes the fixtures to the CORS surface each one is meant to exercise", () => {
    assert.equal(isPublicReadPath(PUBLIC_PATH), true);
    assert.equal(isPublicReadPath(PRIVATE_PATH), false);
    assert.ok(APP_ORIGIN, "CORS_ORIGINS must declare at least one app origin");
  });

  it("exposes every header `unwrap` reads on a credentialed 429", async () => {
    const res = await get429(makeApp("cors_private"), PRIVATE_PATH, APP_ORIGIN ?? "");
    const exposed = exposedHeaders(res);
    for (const header of RETRY_AFTER_HEADERS) {
      assert.ok(
        exposed.has(header.toLowerCase()),
        `${header} must be exposed — a browser hides it otherwise, so ` +
          "ApiClientError.retryAfterSeconds would always be undefined",
      );
    }
    // The values must survive the thrown AppError → onError → c.json() path,
    // otherwise there would be nothing to expose in the first place.
    assert.ok(Number(res.headers.get("Retry-After")) > 0);
    assert.ok(Number(res.headers.get("RateLimit-Reset")) > 0);
    // Pre-existing exposure must not regress.
    assert.ok(exposed.has("x-request-id"));
    assert.ok(exposed.has("ratelimit-remaining"));
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), APP_ORIGIN);
    assert.equal(res.headers.get("Access-Control-Allow-Credentials"), "true");
  });

  it("exposes them on the wildcard public read surface too (`/log/*`)", async () => {
    const res = await get429(makeApp("cors_public"), PUBLIC_PATH, "https://auditor.example");
    const exposed = exposedHeaders(res);
    for (const header of RETRY_AFTER_HEADERS) {
      assert.ok(exposed.has(header.toLowerCase()), `${header} must be exposed on /log/*`);
    }
    assert.ok(Number(res.headers.get("Retry-After")) > 0);
    // Still the no-credentials wildcard surface — that must not have changed.
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(res.headers.get("Access-Control-Allow-Credentials"), null);
  });

  it("advertises the same exposure on the preflight response", async () => {
    const res = await makeApp("cors_preflight").request(PRIVATE_PATH, {
      method: "OPTIONS",
      headers: { Origin: APP_ORIGIN ?? "", "Access-Control-Request-Method": "GET" },
    });
    const exposed = exposedHeaders(res);
    for (const header of RETRY_AFTER_HEADERS) {
      assert.ok(exposed.has(header.toLowerCase()));
    }
  });
});
