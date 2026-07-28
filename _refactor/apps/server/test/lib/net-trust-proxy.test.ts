/**
 * clientIp — TRUST_PROXY=true (P1 TLS en transit : le profil compose "proxy"
 * — Caddy en amont, docker-compose.yml — doit faire passer cette variable à
 * "true" pour que le rate-limit continue de cibler le VRAI visiteur et non
 * l'IP du reverse proxy lui-même).
 *
 * `env` est `Object.freeze`d à la PREMIÈRE importation du module (piège n°11,
 * v2.md §6) : pour exercer `TRUST_PROXY=true` (différent de l'ambiant
 * "false" que tous les autres fichiers `*.test.ts` utilisent), on positionne
 * `process.env.TRUST_PROXY` AVANT tout import de `config/env.ts` (ou de
 * quoi que ce soit qui l'importe transitivement) — node:test exécute chaque
 * fichier dans son propre processus enfant, donc cette bascule reste
 * strictement scopée à CE fichier (pattern de
 * `test/modules/diplomas/pq-emission.test.ts`).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.TRUST_PROXY = "true";

// Import dynamique APRÈS la bascule ci-dessus — un `import` statique serait
// hissé au-dessus et verrait `config/env.ts` déjà figé sur l'ambiant "false".
const { Hono } = await import("hono");
const { clientIp } = await import("../../src/lib/net");
const { env } = await import("../../src/config/env");
type AppEnv = import("../../src/http/types").AppEnv;

describe("clientIp — TRUST_PROXY=true : l'en-tête du reverse proxy fait foi", () => {
  it("précondition : env.TRUST_PROXY est bien 'true' dans CE processus", () => {
    assert.equal(env.TRUST_PROXY, true);
  });

  it("X-Forwarded-For : retient l'entrée la PLUS À DROITE (celle ajoutée par LE proxy de confiance)", async () => {
    const app = new Hono<AppEnv>();
    let ip = "";
    app.get("/p", (c) => {
      ip = clientIp(c);
      return c.json({ ok: true });
    });

    // Client-injected values sit to the LEFT; only the right-most hop (the
    // one the trusted proxy itself appended) is the peer it actually saw.
    await app.request("/p", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.5" } });
    assert.equal(ip, "10.0.0.5");
  });

  it("X-Real-IP : utilisé quand X-Forwarded-For est absent", async () => {
    const app = new Hono<AppEnv>();
    let ip = "";
    app.get("/p", (c) => {
      ip = clientIp(c);
      return c.json({ ok: true });
    });

    await app.request("/p", { headers: { "x-real-ip": "198.51.100.9" } });
    assert.equal(ip, "198.51.100.9");
  });

  it("des visiteurs distincts (en-têtes distincts) retombent sur des IP DIFFÉRENTES — le rate-limit les isole", async () => {
    const app = new Hono<AppEnv>();
    const seen: string[] = [];
    app.get("/p", (c) => {
      seen.push(clientIp(c));
      return c.json({ ok: true });
    });

    await app.request("/p", { headers: { "x-forwarded-for": "1.1.1.1" } });
    await app.request("/p", { headers: { "x-forwarded-for": "2.2.2.2" } });
    assert.equal(new Set(seen).size, 2, `attendu 2 IP distinctes, obtenu: ${seen.join(", ")}`);
  });

  it("ni X-Forwarded-For ni X-Real-IP : retombe sur le TCP peer (jamais une exception)", async () => {
    const app = new Hono<AppEnv>();
    let ip = "";
    app.get("/p", (c) => {
      ip = clientIp(c);
      return c.json({ ok: true });
    });

    await app.request("/p");
    assert.equal(typeof ip, "string");
    assert.ok(ip.length > 0);
  });
});
