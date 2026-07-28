import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import type { AppEnv } from "../../src/http/types";
import { anonymizeIp, clientIp } from "../../src/lib/net";

describe("anonymizeIp (RGPD IP pseudonymization)", () => {
  it("never returns the raw IP", () => {
    const h = anonymizeIp("203.0.113.7");
    assert.notEqual(h, "203.0.113.7");
    assert.match(h, /^[0-9a-f]{32}$/);
  });

  it("is stable for the same input", () => {
    assert.equal(anonymizeIp("203.0.113.7"), anonymizeIp("203.0.113.7"));
  });

  it("collapses an IPv4 /24 to a single bucket (k-anonymity)", () => {
    assert.equal(anonymizeIp("203.0.113.7"), anonymizeIp("203.0.113.250"));
  });

  it("distinguishes different /24 networks", () => {
    assert.notEqual(anonymizeIp("203.0.113.7"), anonymizeIp("203.0.114.7"));
  });

  it("collapses an IPv6 /48 to a single bucket", () => {
    assert.equal(
      anonymizeIp("2001:db8:abcd:0001::1"),
      anonymizeIp("2001:db8:abcd:ffff::99"),
    );
  });
});

/**
 * clientIp — TRUST_PROXY=false (this file's ambient default: unset in `.env`,
 * schema default in `config/env.ts`). Security audit finding #1: a spoofed
 * `X-Forwarded-For` must NEVER rotate the rate-limit bucket unless the API
 * really sits behind a trusted reverse proxy (see docker-compose.yml's Caddy
 * profile, which is the one place that should flip this to "true").
 *
 * `TRUST_PROXY=true` is exercised in its OWN isolated file
 * (`net-trust-proxy.test.ts`, piège n°11 — env is frozen at first import),
 * never here.
 */
describe("clientIp — TRUST_PROXY=false (défaut) : les en-têtes forgeables sont IGNORÉS", () => {
  it("un X-Forwarded-For / X-Real-IP falsifié n'a AUCUN effet sur l'IP retenue", async () => {
    const seen: string[] = [];
    const app = new Hono<AppEnv>();
    app.get("/p", (c) => {
      seen.push(clientIp(c));
      return c.json({ ok: true });
    });

    await app.request("/p", { headers: { "x-forwarded-for": "1.2.3.4" } });
    await app.request("/p", { headers: { "x-forwarded-for": "5.6.7.8" } });
    await app.request("/p", { headers: { "x-real-ip": "9.9.9.9" } });
    await app.request("/p");

    // Les 4 requêtes doivent retomber sur LA MÊME valeur (le TCP peer réel, ou
    // "unknown" en environnement de test sans vraie socket) — jamais celle de
    // l'en-tête, sinon un attaquant ferait tourner les seaux de rate-limit à
    // volonté en changeant juste un en-tête de requête.
    assert.equal(new Set(seen).size, 1, `attendu 1 valeur unique, obtenu: ${seen.join(", ")}`);
    assert.ok(!seen.includes("1.2.3.4") && !seen.includes("5.6.7.8") && !seen.includes("9.9.9.9"));
  });
});
