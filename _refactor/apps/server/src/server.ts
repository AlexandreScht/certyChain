import { sql } from "drizzle-orm";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { env } from "./config/env";
import { db } from "./db/client";
import { runMigrations } from "./db/migrate";
import { platformAdmins } from "./db/schema";
import { startCleanupJob } from "./lib/cleanup";
import { logger } from "./lib/logger";
import { hashPassword } from "./lib/password";

/**
 * Idempotent: creates the bootstrap platform admin (from env) if absent.
 * TOTP is enrolled on first login via the portal QR flow.
 */
async function bootstrapAdmin(): Promise<void> {
  const email = env.ADMIN_BOOTSTRAP_EMAIL.trim().toLowerCase();
  const password = env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!email || !password) return; // silent — bootstrap not configured

  if (password.length < 12) {
    logger.error("bootstrap.admin_password_too_short", {
      hint: "ADMIN_BOOTSTRAP_PASSWORD must be ≥ 12 characters",
    });
    return;
  }

  const [existing] = await db
    .select({ id: platformAdmins.id })
    .from(platformAdmins)
    .where(sql`lower(${platformAdmins.email}) = ${email}`)
    .limit(1);

  if (existing) return; // already exists

  await db.insert(platformAdmins).values({
    email,
    passwordHash: await hashPassword(password),
    fullName: "Platform Admin",
  });
  logger.info("bootstrap.admin_created", { email });
}

async function main(): Promise<void> {
  if (env.MIGRATE_ON_START) {
    try {
      await runMigrations();
    } catch (e) {
      logger.error("startup.migrate_failed", { error: String(e) });
      process.exit(1);
    }
  }

  await bootstrapAdmin();

  const app = createApp();
  const server = serve({ fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" }, (info) => {
    logger.info("server.listening", { port: info.port, env: env.NODE_ENV });
  });

  // Periodic data hygiene: purge expired nonces/OTPs + enforce audit retention.
  startCleanupJob();

  const shutdown = (signal: string): void => {
    logger.info("server.shutdown", { signal });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((e) => {
  logger.error("startup.failed", { error: String(e) });
  process.exit(1);
});
