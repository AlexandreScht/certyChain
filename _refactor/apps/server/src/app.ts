import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { RATE_LIMIT } from "./config/constants";
import type { ApiError } from "@certifychain/contract/errors";
import type { AppEnv } from "./http/types";
import { onError, notFoundHandler } from "./middleware/error-handler";
import { rateLimit } from "./middleware/rate-limit";
import { corsMiddleware, securityHeaders } from "./middleware/security";
import { requestId } from "./middleware/request-id";
import { adminRoutes } from "./modules/admin/admin.routes";
import { auditRoutes } from "./modules/audit/audit.routes";
import { authRoutes } from "./modules/auth/auth.routes";
import { billingRoutes } from "./modules/billing/billing.routes";
import { diplomasRoutes } from "./modules/diplomas/diplomas.routes";
import { schoolsRoutes } from "./modules/schools/schools.routes";
import { verificationRoutes } from "./modules/verification/verification.routes";
import { verifyRoutes } from "./modules/verify/verify.routes";
import { walletRoutes } from "./modules/wallet/wallet.routes";

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
      .use(
        "*",
        bodyLimit({
          maxSize: 1024 * 1024, // 1 MB default (CSV import overrides with its own limit)
          onError: (c) => {
            const body: ApiError = {
              error: { code: "payload_too_large", message: "Charge utile trop volumineuse" },
            };
            return c.json(body, 413);
          },
        }),
      )
      // Coarse global backstop: per authenticated user (each student/admin isolated,
      // so a shared campus/CGNAT egress IP never throttles distinct logged-in users),
      // falling back to a more generous per-IP ceiling for anonymous traffic.
      .use(
        "*",
        rateLimit({
          by: "user-or-ip",
          max: RATE_LIMIT.GLOBAL_USER.max,
          ipMax: RATE_LIMIT.GLOBAL_IP.max,
          windowSec: RATE_LIMIT.GLOBAL_USER.windowSec,
        }),
      )

      // ── Liveness/readiness ─────────────────────────────────────────────────
      .get("/health", (c) => c.json({ status: "ok", ts: new Date().toISOString() }))

      // ── Feature routers ────────────────────────────────────────────────────
      .route("/auth", authRoutes)
      .route("/verify", verifyRoutes)
      .route("/verification", verificationRoutes)
      .route("/schools", schoolsRoutes)
      .route("/billing", billingRoutes)
      .route("/diplomas", diplomasRoutes)
      .route("/wallet", walletRoutes)
      .route("/audit", auditRoutes)
      .route("/admin", adminRoutes)

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
