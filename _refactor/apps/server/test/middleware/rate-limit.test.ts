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

/**
 * Le limiteur lit l'heure via `Date.now()` : ces deux tests pilotent une horloge
 * MOQUÉE (`mock.timers`, API `Date`) plutôt que d'attendre de vrais `setTimeout`.
 * Motif : la marge de la fenêtre glissante vaut `windowMs / max` — avec un vrai
 * sleep, quelques dizaines de ms de gigue de l'event loop (68 suites en
 * parallèle sous Windows) suffisaient à faire basculer l'assertion. L'horloge
 * moquée rend le temps écoulé EXACT, donc le résultat déterministe — et la
 * fenêtre peut redevenir réaliste (60 s) au lieu de 300 ms.
 */
describe("rateLimit — sliding window (P7, différent d'une fenêtre fixe)", () => {
  it("throttles a burst straddling the window boundary (a fixed window would reset fully)", async (t) => {
    t.mock.timers.enable({ apis: ["Date"] }); // t = 0, restaurée en fin de test
    const app = new Hono<AppEnv>();
    app.onError(onError);
    const windowSec = 60;
    app.use("*", rateLimit({ key: "test_sliding_boundary", by: "ip", ipMax: 4, windowSec }));
    app.get("/p", (c) => c.json({ ok: true }));

    // Budget entier consommé à t = 0 (fin de la sous-fenêtre courante).
    for (let i = 0; i < 4; i += 1) {
      assert.equal((await app.request("/p")).status, 200);
    }

    // Juste après la frontière : une fenêtre FIXE remettrait le compteur à zéro
    // et laisserait passer 4 requêtes de plus (8 en ~61 s, soit 2× max).
    t.mock.timers.tick(windowSec * 1000 + 1_000); // t = 61 s

    // Fenêtre glissante : la sous-fenêtre précédente pèse encore 59/60 ≈ 98 %,
    // donc dès la PREMIÈRE requête post-frontière 4 × 0.983 + 1 = 4.93 > 4.
    assert.equal(
      (await app.request("/p")).status,
      429,
      "the previous sub-window's weight must still apply just past the boundary",
    );

    // …et c'est bien une décroissance, pas un bannissement : à 55 s dans la
    // nouvelle sous-fenêtre le poids résiduel tombe à 4 × 0.083 = 0.33 et le
    // budget redevient disponible (0.33 + 2 = 2.33 ≤ 4).
    t.mock.timers.tick(54_000); // t = 115 s
    assert.equal((await app.request("/p")).status, 200);
  });

  it("fully forgets a key idle for ≥ 2 windows (fresh bucket, no permanent penalty)", async (t) => {
    t.mock.timers.enable({ apis: ["Date"] });
    const app = new Hono<AppEnv>();
    app.onError(onError);
    const windowSec = 60;
    app.use("*", rateLimit({ key: "test_sliding_recovery", by: "ip", ipMax: 2, windowSec }));
    app.get("/p", (c) => c.json({ ok: true }));

    assert.equal((await app.request("/p")).status, 200);
    assert.equal((await app.request("/p")).status, 200);
    assert.equal((await app.request("/p")).status, 429, "bucket exhausted");

    // Inactivité de plus de 2 fenêtres pleines : le compteur courant ET le
    // précédent ont totalement décru — budget neuf, pas une sanction persistante.
    t.mock.timers.tick(2 * windowSec * 1000 + 1);

    assert.equal((await app.request("/p")).status, 200, "the key must recover after 2 idle windows");
    assert.equal((await app.request("/p")).status, 200);
    assert.equal((await app.request("/p")).status, 429);
  });
});
