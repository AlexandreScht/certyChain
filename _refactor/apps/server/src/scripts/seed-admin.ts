/**
 * Bootstraps a production platform admin from env (idempotent). TOTP is enrolled
 * on first login (the admin scans the QR shown by the portal).
 *
 *   ADMIN_BOOTSTRAP_EMAIL=you@example.com ADMIN_BOOTSTRAP_PASSWORD='…' \
 *     pnpm --filter @certifychain/server seed:admin
 */
import { sql } from "drizzle-orm";
import { env } from "../config/env";
import { db, sqlClient } from "../db/client";
import { platformAdmins } from "../db/schema";
import { logger } from "../lib/logger";
import { hashPassword } from "../lib/password";

/* eslint-disable no-console */
async function main(): Promise<void> {
  const email = env.ADMIN_BOOTSTRAP_EMAIL.trim().toLowerCase();
  const password = env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!email || !password) {
    console.error("Set ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD in the environment.");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("ADMIN_BOOTSTRAP_PASSWORD must be at least 12 characters.");
    process.exit(1);
  }

  const [existing] = await db
    .select({ id: platformAdmins.id })
    .from(platformAdmins)
    .where(sql`lower(${platformAdmins.email}) = ${email}`)
    .limit(1);

  if (existing) {
    console.log(`Platform admin ${email} already exists — nothing to do.`);
    return;
  }

  await db.insert(platformAdmins).values({
    email,
    passwordHash: await hashPassword(password),
    fullName: "Platform Admin",
  });
  console.log(`Created platform admin ${email}. TOTP will be enrolled on first login.`);
}

main()
  .then(() => sqlClient.end({ timeout: 5 }))
  .then(() => process.exit(0))
  .catch((e) => {
    logger.error("seed-admin.failed", { error: String(e) });
    process.exit(1);
  });
