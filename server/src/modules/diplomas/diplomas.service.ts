import { eq, sql } from "drizzle-orm";
import type { CreateDiplomaInput } from "../../contract/schemas";
import type { DiplomaDTO } from "../../contract/dto";
import {
  hashDiplomaPayload,
  keyVault,
  signDiplomaHash,
  type DiplomaPayload,
} from "../../crypto";
import { db } from "../../db/client";
import { type Diploma, diplomas, schools, students } from "../../db/schema";
import { fail } from "../../lib/http-error";
import { uuid, urlToken } from "../../lib/ids";
import { sendDiplomaNotification } from "../../lib/mailer";
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

  // Find-or-create the holder student (case-insensitive on email).
  const [existing] = await db
    .select()
    .from(students)
    .where(sql`lower(${students.email}) = lower(${input.holderEmail})`)
    .limit(1);

  let studentId: string;
  if (existing) {
    studentId = existing.id;
  } else {
    const [created] = await db
      .insert(students)
      .values({ email: input.holderEmail, fullName: input.holderName })
      .returning({ id: students.id });
    if (!created) throw fail.internal();
    studentId = created.id;
  }

  const [row] = await db
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
  if (!row) throw fail.internal();

  await recordAudit({
    type: "issuance",
    schoolId,
    diplomaId,
    metadata: { programTitle: payload.programTitle },
  });

  // Fire-and-forget holder notification; a mail failure must not fail issuance.
  // The student wallet is now its own app/origin (root path), not /wallet on the web.
  const walletUrl = process.env.WALLET_ORIGIN ?? "http://localhost:3001";
  void sendDiplomaNotification(input.holderEmail, walletUrl, payload.programTitle).catch((e) => {
    logger.error("diploma.notify_failed", { error: String(e), diplomaId });
  });

  return toDiplomaDTO(row, school.name);
}
