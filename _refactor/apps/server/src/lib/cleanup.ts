import { lt, or, isNotNull } from "drizzle-orm";
import { db } from "../db/client";
import { auditLog, otpCodes, verificationNonces } from "../db/schema";
import { logger } from "./logger";

/**
 * Scheduled data hygiene (security audit findings #3, #12).
 *  - Deletes expired / consumed verification nonces and OTP codes (anti
 *    storage-exhaustion; these are short-lived by design).
 *  - Enforces an audit-log retention window (RGPD storage limitation).
 * In-process unref'd timer — fine for the single-instance MVP; move to a DB cron
 * or job runner when scaling horizontally.
 */
const HOUR_MS = 3_600_000;
const AUDIT_RETENTION_DAYS = 365;
const INTERVAL_MS = 6 * HOUR_MS;

export async function purgeExpired(): Promise<void> {
  const now = new Date();
  const auditCutoff = new Date(now.getTime() - AUDIT_RETENTION_DAYS * 24 * HOUR_MS);

  const nonces = await db
    .delete(verificationNonces)
    .where(or(lt(verificationNonces.expiresAt, now), isNotNull(verificationNonces.usedAt)))
    .returning({ id: verificationNonces.id });

  const otps = await db
    .delete(otpCodes)
    .where(or(lt(otpCodes.expiresAt, now), isNotNull(otpCodes.consumedAt)))
    .returning({ id: otpCodes.id });

  const audits = await db
    .delete(auditLog)
    .where(lt(auditLog.createdAt, auditCutoff))
    .returning({ id: auditLog.id });

  logger.info("cleanup.purged", {
    nonces: nonces.length,
    otpCodes: otps.length,
    auditRows: audits.length,
  });
}

/** Run once at boot, then every 6h. Failures are logged, never fatal. */
export function startCleanupJob(): void {
  const run = (): void => {
    purgeExpired().catch((e) => logger.error("cleanup.failed", { error: String(e) }));
  };
  run();
  setInterval(run, INTERVAL_MS).unref();
}
