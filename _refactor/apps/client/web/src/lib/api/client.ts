import { hc } from "hono/client";
import type { AppType } from "@certifychain/server/rpc";
import { API_BASE, createCsrfFetch } from "@certifychain/shared/api/client";

// Realm binding (public `cc_*`): the generic CSRF/credentials fetch from the
// shared kit, bound to this realm's CSRF cookie, drives the typed RPC client.
// `AppType` is imported as a TYPE ONLY — erased at build, no runtime dependency
// on the server package.
// `refreshPath`: on 401, rotate the session via POST /auth/refresh (30-day
// cookie) and retry once — otherwise the 15-min access token logs users out.
export const csrfFetch = createCsrfFetch("cc_csrf", { refreshPath: "/auth/refresh" });

/** Typed RPC client over the whole API (end-to-end inference from the Hono routes). */
export const api = hc<AppType>(API_BASE, { fetch: csrfFetch });

export { API_BASE, ApiClientError, unwrap } from "@certifychain/shared/api/client";
