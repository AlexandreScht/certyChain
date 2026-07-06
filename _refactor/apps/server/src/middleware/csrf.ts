import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { COOKIE, CSRF_HEADER } from "../config/constants";
import type { AppEnv } from "../http/types";
import { fail } from "../lib/http-error";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Constant-time string equality (avoids a length/byte timing oracle). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * CSRF double-submit: on state-changing requests, the CSRF cookie must equal the
 * `x-csrf-token` header. Defense-in-depth on top of SameSite=Strict cookies.
 * Apply only to cookie-authenticated route groups (not public/login). The cookie
 * name is realm-specific (`cc_csrf` public / `cc_admin_csrf` admin).
 */
export const csrfProtect =
  (opts?: { cookie?: string }): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const cookieName = opts?.cookie ?? COOKIE.CSRF;
    if (!SAFE_METHODS.has(c.req.method)) {
      const cookie = getCookie(c, cookieName);
      const header = c.req.header(CSRF_HEADER);
      if (!cookie || !header || !safeEqual(cookie, header)) throw fail.csrf();
    }
    await next();
  };
