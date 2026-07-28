import { and, eq, isNotNull, lt, or } from "drizzle-orm";
import { db } from "../db/client";
import { auditLog, otpCodes, shareLinks, verificationNonces } from "../db/schema";
import { logger } from "./logger";
import {
  purgeExpiredCdcIdentities,
  purgeExpiredCdcRejectReasons,
} from "../modules/accrochage/accrochage.service";
import { purgeExpiredVcOffers } from "../modules/vc/vc.service";

/**
 * Scheduled data hygiene (security audit findings #3, #12; R4 2026-07-28).
 *  - Deletes expired / consumed verification nonces and OTP codes (anti
 *    storage-exhaustion; these are short-lived by design).
 *  - Enforces an audit-log retention window (RGPD storage limitation).
 *  - Deletes revoked/expired share links (R4): `verify.routes.ts` already
 *    treats a revoked OR expired link as an anonymous "not_found" regardless
 *    of whether the row still exists, so purging it changes nothing for the
 *    public verification surface. The only visible effect is that the
 *    OWNING student's own share history (`GET /wallet/diplomas/:id/shares`)
 *    no longer lists it — an accepted trade-off, same one already made for
 *    OTP codes/nonces below (no grace-period retention here either).
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

  const cdcIdentities = await purgeExpiredCdcIdentities(now);
  const cdcRejectReasons = await purgeExpiredCdcRejectReasons(now);
  const vcOffers = await purgeExpiredVcOffers(now);

  // R4: revoked links OR links past their (optional) expiry — mirrors the
  // nonces/OTP condition shape above (`revoked`/`consumedAt` ≈ "already spent").
  const shares = await db
    .delete(shareLinks)
    .where(
      or(
        eq(shareLinks.revoked, true),
        and(isNotNull(shareLinks.expiresAt), lt(shareLinks.expiresAt, now)),
      ),
    )
    .returning({ id: shareLinks.id });

  logger.info("cleanup.purged", {
    nonces: nonces.length,
    otpCodes: otps.length,
    auditRows: audits.length,
    cdcIdentities,
    cdcRejectReasons,
    vcOffers,
    shareLinks: shares.length,
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
