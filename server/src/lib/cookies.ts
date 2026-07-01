import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { ADMIN_COOKIE, COOKIE, type CookieRealm, MFA } from "../config/constants";
import { env } from "../config/env";

type SameSite = "Strict" | "Lax" | "None";

const baseOpts = {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: "Strict" as SameSite,
  domain: env.COOKIE_DOMAIN,
  path: "/",
};

/**
 * Per-realm cookie names + refresh/MFA path scoping. The public realm (school +
 * student) and the admin realm use distinct cookie names so a single browser can
 * hold both sessions without clobbering. Refresh/MFA cookies are path-scoped to
 * their auth routes to shrink the exposure surface.
 */
function realmConfig(realm: CookieRealm) {
  return realm === "admin"
    ? { names: ADMIN_COOKIE, refreshPath: "/auth/admin", mfaPath: "/auth/admin" }
    : { names: COOKIE, refreshPath: "/auth", mfaPath: "/auth" };
}

export function setAuthCookies(
  c: Context,
  tokens: { access: string; refresh: string; csrf: string },
  realm: CookieRealm = "public",
): void {
  const { names, refreshPath } = realmConfig(realm);
  setCookie(c, names.ACCESS, tokens.access, { ...baseOpts, maxAge: env.ACCESS_TOKEN_TTL });
  setCookie(c, names.REFRESH, tokens.refresh, {
    ...baseOpts,
    path: refreshPath,
    maxAge: env.REFRESH_TOKEN_TTL,
  });
  // CSRF token is intentionally readable by JS (double-submit pattern).
  setCookie(c, names.CSRF, tokens.csrf, {
    ...baseOpts,
    httpOnly: false,
    maxAge: env.REFRESH_TOKEN_TTL,
  });
}

export function clearAuthCookies(c: Context, realm: CookieRealm = "public"): void {
  const { names, refreshPath } = realmConfig(realm);
  deleteCookie(c, names.ACCESS, { ...baseOpts });
  deleteCookie(c, names.REFRESH, { ...baseOpts, path: refreshPath });
  deleteCookie(c, names.CSRF, { ...baseOpts, httpOnly: false });
}

/** Sets the short-lived (httpOnly) "MFA pending" cookie between login steps. */
export function setMfaCookie(c: Context, token: string, realm: CookieRealm = "public"): void {
  const { names, mfaPath } = realmConfig(realm);
  setCookie(c, names.MFA, token, { ...baseOpts, path: mfaPath, maxAge: MFA.CHALLENGE_TTL_SECONDS });
}

export function clearMfaCookie(c: Context, realm: CookieRealm = "public"): void {
  const { names, mfaPath } = realmConfig(realm);
  deleteCookie(c, names.MFA, { ...baseOpts, path: mfaPath });
}
