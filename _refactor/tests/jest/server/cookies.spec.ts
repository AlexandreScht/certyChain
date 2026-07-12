/**
 * Cookies d'auth — isolation des réalms (cc_* public vs cc_admin_* admin,
 * un même navigateur doit pouvoir tenir les deux sessions) + scoping `Path`
 * des cookies refresh/MFA + matrice HttpOnly (le CSRF double-submit doit
 * rester lisible par JS, tout le reste non).
 */
import { ADMIN_COOKIE, COOKIE, MFA } from "../../../apps/server/src/config/constants";
import { env } from "../../../apps/server/src/config/env";
import {
  clearAuthCookies,
  setAuthCookies,
  setMfaCookie,
} from "../../../apps/server/src/lib/cookies";

type Ctx = Parameters<typeof setAuthCookies>[0];

/** Contexte Hono minimal : capture les valeurs `Set-Cookie` émises. */
function fakeContext(): { ctx: Ctx; jar: string[] } {
  const jar: string[] = [];
  const ctx = {
    header: (_name: string, value?: string) => {
      if (value !== undefined) jar.push(value);
    },
    req: { raw: new Request("http://localhost/") },
  } as unknown as Ctx;
  return { ctx, jar };
}

const cookieOf = (jar: string[], name: string): string => {
  const found = jar.find((c) => c.startsWith(`${name}=`));
  expect(found).toBeDefined();
  return found as string;
};

const TOKENS = { access: "at-val", refresh: "rt-val", csrf: "csrf-val" };

describe("setAuthCookies — réalm public", () => {
  const { ctx, jar } = fakeContext();
  setAuthCookies(ctx, TOKENS, "public");

  it("pose l'access token httpOnly, SameSite=Strict, Path=/, TTL court", () => {
    const c = cookieOf(jar, COOKIE.ACCESS);
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Strict/i);
    expect(c).toMatch(/Path=\/(;|$)/i);
    expect(c).toContain(`Max-Age=${env.ACCESS_TOKEN_TTL}`);
  });

  it("scope le refresh token sur /auth (surface d'exposition minimale)", () => {
    const c = cookieOf(jar, COOKIE.REFRESH);
    expect(c).toMatch(/Path=\/auth(;|$)/i);
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toContain(`Max-Age=${env.REFRESH_TOKEN_TTL}`);
  });

  it("laisse le cookie CSRF lisible par JS (double-submit) — jamais HttpOnly", () => {
    const c = cookieOf(jar, COOKIE.CSRF);
    expect(c).not.toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Strict/i);
  });

  it("n'émet aucun cookie du réalm admin", () => {
    expect(jar.some((c) => c.startsWith("cc_admin_"))).toBe(false);
  });
});

describe("setAuthCookies — réalm admin", () => {
  const { ctx, jar } = fakeContext();
  setAuthCookies(ctx, TOKENS, "admin");

  it("utilise les noms cc_admin_* (sessions école + admin cohabitent)", () => {
    cookieOf(jar, ADMIN_COOKIE.ACCESS);
    cookieOf(jar, ADMIN_COOKIE.REFRESH);
    cookieOf(jar, ADMIN_COOKIE.CSRF);
    expect(jar.some((c) => c.startsWith(`${COOKIE.ACCESS}=`))).toBe(false);
  });

  it("scope le refresh admin sur /auth/admin", () => {
    expect(cookieOf(jar, ADMIN_COOKIE.REFRESH)).toMatch(/Path=\/auth\/admin(;|$)/i);
  });
});

describe("setMfaCookie", () => {
  it("cookie « MFA pending » httpOnly, scoppé /auth, TTL = challenge (300 s)", () => {
    const { ctx, jar } = fakeContext();
    setMfaCookie(ctx, "mfa-val", "public");
    const c = cookieOf(jar, COOKIE.MFA);
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/Path=\/auth(;|$)/i);
    expect(c).toContain(`Max-Age=${MFA.CHALLENGE_TTL_SECONDS}`);
  });
});

describe("clearAuthCookies", () => {
  it("expire les trois cookies du réalm (valeur vidée, Max-Age=0)", () => {
    const { ctx, jar } = fakeContext();
    clearAuthCookies(ctx, "public");
    for (const name of [COOKIE.ACCESS, COOKIE.REFRESH, COOKIE.CSRF]) {
      const c = cookieOf(jar, name);
      expect(c.startsWith(`${name}=;`)).toBe(true);
      expect(c).toMatch(/Max-Age=0(;|$)/i);
    }
  });
});
