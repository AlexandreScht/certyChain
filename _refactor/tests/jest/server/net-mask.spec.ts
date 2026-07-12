/** Pseudonymisation RGPD + clés de rate-limit + masquage e-mail. */
import { maskEmail } from "../../../apps/server/src/lib/mask";
import { anonymizeIp, rateLimitIpKey } from "../../../apps/server/src/lib/net";

describe("rateLimitIpKey", () => {
  it("garde l'IPv4 complète (pas de /24 qui sur-bloquerait un FAI)", () => {
    expect(rateLimitIpKey("203.0.113.7")).toBe("203.0.113.7");
    expect(rateLimitIpKey("203.0.113.8")).not.toBe(rateLimitIpKey("203.0.113.7"));
  });

  it("réduit l'IPv6 à son /64 (anti-rotation intra-préfixe)", () => {
    const a = rateLimitIpKey("2001:db8:aaaa:bbbb:1111:2222:3333:4444");
    const b = rateLimitIpKey("2001:db8:aaaa:bbbb:9999:8888:7777:6666");
    expect(a).toBe(b);
    expect(a).toMatch(/\/64$/);
  });

  it("distingue deux /64 différents", () => {
    expect(rateLimitIpKey("2001:db8:aaaa:bbbb::1")).not.toBe(
      rateLimitIpKey("2001:db8:aaaa:cccc::1"),
    );
  });
});

describe("anonymizeIp", () => {
  it("est stable pour une même IP et ne contient jamais l'IP brute", () => {
    const h = anonymizeIp("203.0.113.7");
    expect(anonymizeIp("203.0.113.7")).toBe(h);
    expect(h).not.toContain("203.0.113");
    expect(h).toMatch(/^[0-9a-f]{32}$/);
  });

  it("k-anonymise dans le /24 : deux IP du même sous-réseau partagent le hash", () => {
    expect(anonymizeIp("203.0.113.7")).toBe(anonymizeIp("203.0.113.250"));
    expect(anonymizeIp("203.0.113.7")).not.toBe(anonymizeIp("203.0.114.7"));
  });
});

describe("maskEmail", () => {
  it("garde 2 caractères + le domaine", () => {
    expect(maskEmail("alexandre@ecole.fr")).toBe("al•••••••@ecole.fr");
  });

  it("masque au moins 2 caractères même sur un local court", () => {
    expect(maskEmail("ab@x.fr")).toBe("ab••@x.fr");
  });

  it("retourne un masque neutre sur une entrée invalide", () => {
    expect(maskEmail("pas-un-email")).toBe("••••");
    expect(maskEmail("@x.fr")).toBe("••••");
  });
});
