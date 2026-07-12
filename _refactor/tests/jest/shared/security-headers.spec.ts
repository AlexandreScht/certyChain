/**
 * En-têtes de sécurité partagés des 3 fronts (next.config.ts) — CSP,
 * anti-framing, HSTS, et la politique d'indexation des surfaces privées
 * (wallet/admin). Une dérive ici affaiblit silencieusement les 3 apps.
 */
import {
  buildSecurityHeaders,
  type SecurityHeader,
} from "@certifychain/shared/config/security-headers";

const valueOf = (headers: SecurityHeader[], key: string): string | undefined =>
  headers.find((h) => h.key === key)?.value;

const PROD = { apiOrigin: "https://api.certifychain.fr", isDev: false };

describe("buildSecurityHeaders — CSP", () => {
  it("verrouille les sources et n'ouvre connect-src qu'à l'API", () => {
    const csp = valueOf(buildSecurityHeaders(PROD), "Content-Security-Policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("connect-src 'self' https://api.certifychain.fr");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("n'autorise 'unsafe-eval' (react-refresh) qu'en dev, jamais en prod", () => {
    const prodCsp = valueOf(buildSecurityHeaders(PROD), "Content-Security-Policy") ?? "";
    expect(prodCsp).not.toContain("unsafe-eval");

    const devCsp =
      valueOf(
        buildSecurityHeaders({ apiOrigin: "http://localhost:4000", isDev: true }),
        "Content-Security-Policy",
      ) ?? "";
    expect(devCsp).toMatch(/script-src[^;]*'unsafe-eval'/);
    // …et uniquement dans script-src, pas dans style-src.
    expect(devCsp).not.toMatch(/style-src[^;]*'unsafe-eval'/);
  });
});

describe("buildSecurityHeaders — en-têtes fixes", () => {
  const headers = buildSecurityHeaders(PROD);

  it("anti-sniffing + anti-framing (double garde avec frame-ancestors)", () => {
    expect(valueOf(headers, "X-Content-Type-Options")).toBe("nosniff");
    expect(valueOf(headers, "X-Frame-Options")).toBe("DENY");
  });

  it("HSTS long avec includeSubDomains + preload", () => {
    expect(valueOf(headers, "Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
  });

  it("coupe caméra/micro/géoloc/topics via Permissions-Policy", () => {
    expect(valueOf(headers, "Permissions-Policy")).toContain("camera=()");
    expect(valueOf(headers, "Permissions-Policy")).toContain("geolocation=()");
  });
});

describe("buildSecurityHeaders — options par surface", () => {
  it("Referrer-Policy : défaut web public, override no-referrer (wallet/admin)", () => {
    expect(valueOf(buildSecurityHeaders(PROD), "Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(
      valueOf(
        buildSecurityHeaders({ ...PROD, referrerPolicy: "no-referrer" }),
        "Referrer-Policy",
      ),
    ).toBe("no-referrer");
  });

  it("noindex : X-Robots-Tag émis pour les surfaces privées, absent sinon", () => {
    expect(valueOf(buildSecurityHeaders(PROD), "X-Robots-Tag")).toBeUndefined();
    expect(valueOf(buildSecurityHeaders({ ...PROD, noindex: true }), "X-Robots-Tag")).toBe(
      "noindex, nofollow, noarchive",
    );
  });
});
