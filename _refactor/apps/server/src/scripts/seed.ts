/**
 * Seeds a ready-to-demo dataset: a platform admin, an approved school (with keys
 * + certificate), a school admin, a student, a signed diploma, and a public share
 * link. Both admin accounts are pre-enrolled with TOTP (secret printed below).
 *
 *   pnpm --filter @certifychain/server db:seed
 */
import { eq } from "drizzle-orm";
import { keyVault } from "../crypto/envelope";
import { type DiplomaPayload, hashDiplomaPayload } from "../crypto/hashing";
import { generateEd25519KeyPair, issueSchoolCertificate, signDiplomaHash } from "../crypto/keys";
import { db, sqlClient } from "../db/client";
import {
  diplomas,
  platformAdmins,
  platformSettings,
  schoolAdmins,
  schools,
  shareLinks,
  students,
} from "../db/schema";
import { urlToken, uuid } from "../lib/ids";
import { logger } from "../lib/logger";
import { hashPassword } from "../lib/password";
import { generateTotpSecret, totpAuthUri } from "../lib/totp";

const SCHOOL_NAME = "École Démo CertifyChain";
const ADMIN_EMAIL = "admin@ecole-demo.fr";
const ADMIN_PASSWORD = "DemoPassw0rd!24";
const STUDENT_EMAIL = "alex.dubois@example.com";
const PLATFORM_ADMIN_EMAIL = "admin@certifychain.local";
const PLATFORM_ADMIN_PASSWORD = "AdminPassw0rd!24";

/* eslint-disable no-console */

/** Creates the demo platform admin (TOTP pre-enrolled) if none exists. */
async function ensurePlatformAdmin(): Promise<void> {
  const [existing] = await db.select().from(platformAdmins).limit(1);
  if (existing) {
    logger.info("seed.platform_admin_exists");
    return;
  }
  const totp = generateTotpSecret();
  await db.insert(platformAdmins).values({
    email: PLATFORM_ADMIN_EMAIL,
    passwordHash: await hashPassword(PLATFORM_ADMIN_PASSWORD),
    fullName: "Admin Plateforme",
    totpSecret: keyVault.encrypt(totp),
    totpEnabledAt: new Date(),
  });
  console.log("\n── Admin plateforme (portail admin :3002) ─────────────");
  console.log(`Login     : ${PLATFORM_ADMIN_EMAIL} / ${PLATFORM_ADMIN_PASSWORD}`);
  console.log(`TOTP URI  : ${totpAuthUri(PLATFORM_ADMIN_EMAIL, totp)}`);
  console.log(`TOTP secret (saisie manuelle) : ${totp}`);
}

/** Seeds the singleton platform settings row if absent. */
async function ensureSettings(): Promise<void> {
  const [existing] = await db.select().from(platformSettings).limit(1);
  if (!existing) {
    await db.insert(platformSettings).values({ autoValidateEnabled: false, autoValidateMinScore: 85 });
  }
}

async function seed(): Promise<void> {
  await ensurePlatformAdmin();
  await ensureSettings();

  const existing = await db.select().from(schools).where(eq(schools.name, SCHOOL_NAME)).limit(1);
  if (existing.length > 0) {
    logger.info("seed.skip_already_exists");
    return;
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const { publicKey, privateKey } = generateEd25519KeyPair();
  const schoolId = uuid();
  const certificate = issueSchoolCertificate({
    schoolId,
    publicKey,
    name: SCHOOL_NAME,
    issuedAt: today,
  });

  await db.insert(schools).values({
    id: schoolId,
    name: SCHOOL_NAME,
    siret: "12345678901234",
    city: "Paris",
    contactEmail: "contact@ecole-demo.fr",
    status: "approved",
    publicKey,
    encryptedPrivateKey: keyVault.encrypt(privateKey),
    certificate,
    approvedAt: now,
    validationScore: 96,
    validationReasoning: "École de démonstration pré-approuvée (seed).",
    validationSignals: [
      { label: "SIRENE vérifié", status: "good" },
      { label: "Activité enseignement", status: "good" },
      { label: "Nom concordant", status: "good" },
      { label: "Ville concordante", status: "good" },
    ],
    autoValidated: false,
  });

  const schoolTotp = generateTotpSecret();
  await db.insert(schoolAdmins).values({
    schoolId,
    email: ADMIN_EMAIL,
    passwordHash: await hashPassword(ADMIN_PASSWORD),
    fullName: "Admin Démo",
    totpSecret: keyVault.encrypt(schoolTotp),
    totpEnabledAt: now,
  });

  const [student] = await db
    .insert(students)
    .values({ email: STUDENT_EMAIL, fullName: "Alex Dubois" })
    .returning();

  const diplomaId = uuid();
  const payload: DiplomaPayload = {
    id: diplomaId,
    schoolId,
    holderName: "Alex Dubois",
    holderEmail: STUDENT_EMAIL,
    programTitle: "Master Data Science",
    mention: "Très Bien",
    rncp: "RNCP34031",
    issuedAt: "2025-07-03",
    externalId: "DEMO-001",
  };
  const payloadHash = hashDiplomaPayload(payload);

  await db.insert(diplomas).values({
    id: diplomaId,
    schoolId,
    studentId: student?.id ?? null,
    holderName: payload.holderName,
    holderEmail: payload.holderEmail,
    programTitle: payload.programTitle,
    mention: payload.mention,
    rncp: payload.rncp,
    issuedAt: payload.issuedAt,
    externalId: payload.externalId,
    payloadHash,
    signature: signDiplomaHash(privateKey, payloadHash),
    encryptedHolderSecret: keyVault.encrypt(urlToken(32)),
    status: "active",
  });

  const token = urlToken(24);
  await db.insert(shareLinks).values({
    diplomaId,
    token,
    createdByStudentId: student?.id ?? null,
    expiresAt: null,
  });

  logger.info("seed.done", { schoolId, diplomaId });
  console.log("\n── Démo prête ─────────────────────────────────────────");
  console.log(`École admin   : ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`  TOTP URI    : ${totpAuthUri(ADMIN_EMAIL, schoolTotp)}`);
  console.log(`  TOTP secret : ${schoolTotp}`);
  console.log(`Wallet élève  : ${STUDENT_EMAIL} (OTP affiché dans les logs API)`);
  console.log(`Lien de vérif : http://localhost:3000/verify/${token}`);
  console.log("───────────────────────────────────────────────────────\n");
}

seed()
  .then(() => sqlClient.end({ timeout: 5 }))
  .then(() => process.exit(0))
  .catch((e) => {
    logger.error("seed.failed", { error: String(e) });
    process.exit(1);
  });
