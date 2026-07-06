import { and, eq, sql } from "drizzle-orm";
import { CLAIM } from "../../config/constants";
import { env } from "../../config/env";
import type { CreateDiplomaInput } from "@certifychain/contract/schemas";
import type { DiplomaDTO } from "@certifychain/contract/dto";
import {
  hashDiplomaPayload,
  keyVault,
  signDiplomaHash,
  type DiplomaPayload,
} from "../../crypto";
import { db } from "../../db/client";
import { type Diploma, diplomas, schools, students, studentEmailAliases } from "../../db/schema";
import { fail } from "../../lib/http-error";
import { uuid, urlToken } from "../../lib/ids";
import { sendDiplomaClaimEmail, sendDiplomaNotification } from "../../lib/mailer";
import { logger } from "../../lib/logger";
import { recordAudit } from "../audit/audit.service";

/** Maps a diploma row to its public DTO. */
export function toDiplomaDTO(row: Diploma, schoolName: string): DiplomaDTO {
  return {
    id: row.id,
    schoolName,
    holderName: row.holderName,
    holderEmail: row.holderEmail,
    programTitle: row.programTitle,
    mention: row.mention,
    rncp: row.rncp,
    issuedAt: row.issuedAt,
    externalId: row.externalId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    revocationReason: row.revocationReason,
  };
}

/** True for a Postgres unique-constraint violation (SQLSTATE 23505). */
function isUniqueViolation(e: unknown): boolean {
  const code =
    (e as { code?: string } | null)?.code ??
    (e as { cause?: { code?: string } } | null)?.cause?.code;
  return code === "23505";
}

/**
 * Issues a single diploma for an approved school: builds and hashes the canonical
 * payload, signs it with the school's (decrypted) private key, finds-or-creates the
 * holder student, persists the diploma, audits the issuance and notifies the holder.
 */
export async function issueDiploma(
  schoolId: string,
  input: CreateDiplomaInput,
): Promise<DiplomaDTO> {
  const [school] = await db.select().from(schools).where(eq(schools.id, schoolId)).limit(1);
  if (
    !school ||
    school.status !== "approved" ||
    !school.publicKey ||
    !school.encryptedPrivateKey
  ) {
    throw fail.schoolNotApproved();
  }

  const diplomaId = uuid();
  const payload: DiplomaPayload = {
    id: diplomaId,
    schoolId,
    holderName: input.holderName,
    holderEmail: input.holderEmail,
    programTitle: input.programTitle,
    mention: input.mention ?? null,
    rncp: input.rncp ?? null,
    issuedAt: input.issuedAt,
    externalId: input.externalId ?? null,
  };

  const payloadHash = hashDiplomaPayload(payload);
  const privateKeyPem = keyVault.decryptToString(school.encryptedPrivateKey);
  const signature = signDiplomaHash(privateKeyPem, payloadHash);

  // Resolve the holder identity via the (school, address) alias — NOT directly
  // by `students.email`, which is the holder's personal login identity and may
  // not exist yet (see claim.service.ts). Reusing an existing alias (verified
  // or still-pending) covers repeat issuance to the same known relationship
  // without duplicating students or re-sending a claim email.
  //
  // The whole find-or-create-student + create-alias + insert-diploma sequence
  // runs in ONE transaction so a mid-sequence failure rolls back cleanly (no
  // orphan student row). Two concurrent FIRST issuances to the same (school,
  // address) race on the alias unique index `(school_id, lower(email))`; the
  // loser's transaction rolls back entirely, then we retry once — the alias now
  // exists, so the retry takes the reuse branch instead of raising a 500.
  const persist = () =>
    db.transaction(async (tx) => {
      const [existingAlias] = await tx
        .select()
        .from(studentEmailAliases)
        .where(
          and(
            eq(studentEmailAliases.schoolId, schoolId),
            sql`lower(${studentEmailAliases.email}) = lower(${input.holderEmail})`,
          ),
        )
        .limit(1);

      let studentId: string;
      let freshAlias: typeof studentEmailAliases.$inferSelect | undefined;
      if (existingAlias) {
        studentId = existingAlias.studentId;
      } else {
        const [created] = await tx
          .insert(students)
          .values({ email: null, fullName: input.holderName })
          .returning({ id: students.id });
        if (!created) throw fail.internal();
        studentId = created.id;

        const [createdAlias] = await tx
          .insert(studentEmailAliases)
          .values({
            studentId,
            schoolId,
            email: input.holderEmail,
            claimToken: urlToken(CLAIM.TOKEN_BYTES),
            claimTokenExpiresAt: new Date(Date.now() + CLAIM.TTL_SECONDS * 1000),
          })
          .returning();
        if (!createdAlias) throw fail.internal();
        freshAlias = createdAlias;
      }

      const [inserted] = await tx
        .insert(diplomas)
        .values({
          id: diplomaId,
          schoolId,
          studentId,
          holderName: payload.holderName,
          holderEmail: payload.holderEmail,
          programTitle: payload.programTitle,
          mention: payload.mention,
          rncp: payload.rncp,
          issuedAt: payload.issuedAt,
          externalId: payload.externalId,
          payloadHash,
          signature,
          encryptedHolderSecret: keyVault.encrypt(urlToken(32)),
          status: "active",
        })
        .returning();
      if (!inserted) throw fail.internal();
      return { row: inserted, studentId, existingAlias, freshAlias };
    });

  let persisted: Awaited<ReturnType<typeof persist>>;
  try {
    persisted = await persist();
  } catch (e) {
    // Alias unique violation ⇒ a concurrent first issuance created it between our
    // SELECT and INSERT. The transaction rolled back (no orphan student); retry
    // once, now taking the reuse branch. Any other error / a second failure bubbles up.
    if (!isUniqueViolation(e)) throw e;
    persisted = await persist();
  }
  const { row, studentId, existingAlias, freshAlias } = persisted;

  await recordAudit({
    type: "issuance",
    schoolId,
    diplomaId,
    metadata: { programTitle: payload.programTitle },
  });

  // Fire-and-forget holder notification; a mail failure must not fail issuance.
  // The student wallet is now its own app/origin (root path), not /wallet on the web.
  // Route to whichever address is actually live: the personal login email once
  // the holder has claimed (durable), else the claim invite to the school
  // address that triggered THIS issuance (skipped on repeat issuance to an
  // already-pending alias, so the holder isn't re-mailed the same invite).
  const walletUrl = env.WALLET_ORIGIN;
  if (existingAlias?.verifiedAt) {
    const [holder] = await db
      .select({ email: students.email })
      .from(students)
      .where(eq(students.id, studentId))
      .limit(1);
    if (holder?.email) {
      void sendDiplomaNotification(holder.email, walletUrl, payload.programTitle).catch((e) => {
        logger.error("diploma.notify_failed", { error: String(e), diplomaId });
      });
    }
  } else if (freshAlias?.claimToken) {
    const claimUrl = `${walletUrl}/claim/${freshAlias.claimToken}`;
    void sendDiplomaClaimEmail(input.holderEmail, claimUrl, school.name).catch((e) => {
      logger.error("diploma.claim_notify_failed", { error: String(e), diplomaId });
    });
  }

  return toDiplomaDTO(row, school.name);
}
