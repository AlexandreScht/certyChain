import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { RATE_LIMIT } from "./config/constants";
import type { ApiError } from "./contract/errors";
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

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // ── Global middleware (order matters) ──────────────────────────────────
  app.use("*", requestId());
  app.use("*", securityHeaders());
  app.use("*", corsMiddleware());
  app.use(
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
  );
  // Coarse global backstop: per authenticated user (each student/admin isolated,
  // so a shared campus/CGNAT egress IP never throttles distinct logged-in users),
  // falling back to a more generous per-IP ceiling for anonymous traffic.
  app.use(
    "*",
    rateLimit({
      by: "user-or-ip",
      max: RATE_LIMIT.GLOBAL_USER.max,
      ipMax: RATE_LIMIT.GLOBAL_IP.max,
      windowSec: RATE_LIMIT.GLOBAL_USER.windowSec,
    }),
  );

  // ── Liveness/readiness ─────────────────────────────────────────────────
  app.get("/health", (c) => c.json({ status: "ok", ts: new Date().toISOString() }));

  // ── Feature routers ────────────────────────────────────────────────────
  app.route("/auth", authRoutes);
  app.route("/verify", verifyRoutes);
  app.route("/verification", verificationRoutes);
  app.route("/schools", schoolsRoutes);
  app.route("/billing", billingRoutes);
  app.route("/diplomas", diplomasRoutes);
  app.route("/wallet", walletRoutes);
  app.route("/audit", auditRoutes);
  app.route("/admin", adminRoutes);

  app.onError(onError);
  app.notFound(notFoundHandler);

  return app;
}
