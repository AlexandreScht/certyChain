import { hc } from "hono/client";
import type { AppType } from "@certifychain/server/rpc";
import { API_BASE, createCsrfFetch } from "@certifychain/shared/api/client";

// Realm binding (admin `cc_admin_*`, isolé du realm public) : le fetch
// CSRF/credentials générique du kit partagé, lié au cookie CSRF admin,
// alimente le client RPC typé. `AppType` est importé en TYPE UNIQUEMENT —
// effacé au build, aucune dépendance runtime vers le serveur.
// `refreshPath` : sur 401, rotation de session via POST /auth/admin/refresh
// (cookie 30 j) puis un seul retry — sinon l'access token 15 min déconnecte.
export const csrfFetch = createCsrfFetch("cc_admin_csrf", {
  refreshPath: "/auth/admin/refresh",
});

/** Typed RPC client over the whole API (end-to-end inference from the Hono routes). */
export const api = hc<AppType>(API_BASE, { fetch: csrfFetch });

export { API_BASE, ApiClientError, unwrap } from "@certifychain/shared/api/client";
export { apiErrorMessage } from "@certifychain/shared/api/error-message";
