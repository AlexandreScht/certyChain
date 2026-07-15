import { Hono, type Context, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { CDC_UPLOAD_LIMITS } from "@certifychain/contract/constants";
import type { ApiError } from "@certifychain/contract/errors";
import { RATE_LIMIT } from "./config/constants";
import type { AppEnv } from "./http/types";
import { onError, notFoundHandler } from "./middleware/error-handler";
import { rateLimit } from "./middleware/rate-limit";
import { corsMiddleware, securityHeaders } from "./middleware/security";
import { requestId } from "./middleware/request-id";
import { AppError } from "./lib/http-error";
import { adminRoutes } from "./modules/admin/admin.routes";
import { accrochageRoutes } from "./modules/accrochage/accrochage.routes";
import { auditRoutes } from "./modules/audit/audit.routes";
import { authRoutes } from "./modules/auth/auth.routes";
import { billingRoutes } from "./modules/billing/billing.routes";
import { diplomasRoutes } from "./modules/diplomas/diplomas.routes";
import { schoolsRoutes } from "./modules/schools/schools.routes";
import { verificationRoutes } from "./modules/verification/verification.routes";
import { verifyRoutes } from "./modules/verify/verify.routes";
import { transparencyRoutes } from "./modules/transparency/transparency.routes";
import { walletRoutes } from "./modules/wallet/wallet.routes";
import { vcRoutes } from "./modules/vc/vc.routes";

const MIB = 1024 * 1024;

function payloadTooLarge(c: Context): Response {
  const body: ApiError = {
    error: { code: "payload_too_large", message: "Charge utile trop volumineuse" },
  };
  return c.json(body, 413);
}

const requestBodyLimiters = {
  default: bodyLimit({ maxSize: MIB, onError: payloadTooLarge }),
  cdcIdentity: bodyLimit({
    maxSize: CDC_UPLOAD_LIMITS.identityCsv,
    onError: payloadTooLarge,
  }),
  cdcCrt: bodyLimit({ maxSize: CDC_UPLOAD_LIMITS.crt, onError: payloadTooLarge }),
  diplomas: bodyLimit({ maxSize: 5 * MIB, onError: payloadTooLarge }),
} as const;

/**
 * The global limiter must know about larger multipart/XML routes. A blanket
 * 1 MiB middleware runs before route-local middleware and would otherwise
 * reject their documented 2/5 MiB payloads before the router sees them.
 */
function routeAwareBodyLimit(): MiddlewareHandler<AppEnv> {
  return (c, next) => {
    const path = c.req.path;
    if (path === "/diplomas/import" || path === "/diplomas/import/") {
      return requestBodyLimiters.diplomas(c, next);
    }
    if (
      path === "/cdc/identities/import" ||
      path === "/cdc/identities/import/"
    ) {
      return requestBodyLimiters.cdcIdentity(c, next);
    }
    if (/^\/cdc\/exports\/[^/]+\/crt\/?$/.test(path)) {
      return requestBodyLimiters.cdcCrt(c, next);
    }
    return requestBodyLimiters.default(c, next);
  };
}

const globalBackstop = rateLimit({
  by: "user-or-ip",
  max: RATE_LIMIT.GLOBAL_USER.max,
  ipMax: RATE_LIMIT.GLOBAL_IP.max,
  windowSec: RATE_LIMIT.GLOBAL_USER.windowSec,
});

/** OAuth/OID4VCI clients must never receive the internal ApiError envelope. */
function globalRateLimit(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    try {
      return await globalBackstop(c, next);
    } catch (error) {
      if (
        error instanceof AppError &&
        error.status === 429 &&
        ["/vc/nonce", "/vc/oauth/token", "/vc/credential"].includes(c.req.path)
      ) {
        c.header("Cache-Control", "no-store");
        return c.json({ error: "slow_down" }, 429);
      }
      throw error;
    }
  };
}

// NOTE (RPC typé) : la composition reste CHAÎNÉE et `createApp` n'annote PAS son
// type de retour — c'est ce qui laisse l'inférence Hono construire le schéma
// complet des routes, exposé aux fronts via `AppType` + `hc<AppType>()`.
// Toute nouvelle route doit être enregistrée en style chaîné (`.get().post()…`),
// sinon son type est perdu pour les clients.
export function createApp() {
  return (
    new Hono<AppEnv>()

      // ── Global middleware (order matters) ──────────────────────────────────
      .use("*", requestId())
      .use("*", securityHeaders())
      .use("*", corsMiddleware())
      .use("*", routeAwareBodyLimit())
      // Coarse global backstop: per authenticated user (each student/admin isolated,
      // so a shared campus/CGNAT egress IP never throttles distinct logged-in users),
      // falling back to a more generous per-IP ceiling for anonymous traffic.
      .use(
        "*",
        globalRateLimit(),
      )

      // ── Liveness/readiness ─────────────────────────────────────────────────
      .get("/health", (c) => c.json({ status: "ok", ts: new Date().toISOString() }))

      // ── Feature routers ────────────────────────────────────────────────────
      .route("/auth", authRoutes)
      .route("/verify", verifyRoutes)
      .route("/log", transparencyRoutes)
      .route("/verification", verificationRoutes)
      .route("/schools", schoolsRoutes)
      .route("/billing", billingRoutes)
      .route("/diplomas", diplomasRoutes)
      .route("/cdc", accrochageRoutes)
      .route("/wallet", walletRoutes)
      .route("/audit", auditRoutes)
      .route("/admin", adminRoutes)
      .route("/", vcRoutes)

      .onError(onError)
      .notFound(notFoundHandler)
  );
}

/**
 * Type RPC bout-en-bout, consommé par les apps clientes via
 * `hc<AppType>(API_BASE, { fetch })` — en `import type` UNIQUEMENT
 * (effacé au build : aucune dépendance runtime front → serveur).
 */
export type AppType = ReturnType<typeof createApp>;
