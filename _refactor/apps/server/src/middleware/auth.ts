import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { ADMIN_COOKIE, COOKIE } from "../config/constants";
import type { Role } from "@certifychain/contract/enums";
import type { AppEnv } from "../http/types";
import { fail } from "../lib/http-error";
import { type AccessClaims, verifyAccessToken } from "../lib/tokens";

/** Requires a valid access cookie; optionally restricts to the given role(s). */
export const requireAuth =
  (...roles: Role[]): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const token = getCookie(c, COOKIE.ACCESS);
    if (!token) throw fail.unauthorized();

    let claims: AccessClaims;
    try {
      claims = await verifyAccessToken(token);
    } catch {
      throw fail.unauthorized("Session invalide ou expirée");
    }

    if (roles.length > 0 && !roles.includes(claims.role)) throw fail.forbidden();
    c.set("auth", claims);
    await next();
  };

/**
 * Guards platform-admin routes: reads the ADMIN-realm access cookie (isolated
 * from the public school/student cookies) and requires the `admin` role.
 */
export const requireAdminAuth =
  (): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const token = getCookie(c, ADMIN_COOKIE.ACCESS);
    if (!token) throw fail.unauthorized();

    let claims: AccessClaims;
    try {
      claims = await verifyAccessToken(token);
    } catch {
      throw fail.unauthorized("Session invalide ou expirée");
    }

    if (claims.role !== "admin") throw fail.forbidden();
    c.set("auth", claims);
    await next();
  };

/** Retrieves the authenticated claims (throws if the route wasn't guarded). */
export function getAuth(c: Context<AppEnv>): AccessClaims {
  const auth = c.get("auth");
  if (!auth) throw fail.unauthorized();
  return auth;
}
