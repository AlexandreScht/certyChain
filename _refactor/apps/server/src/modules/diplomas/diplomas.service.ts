import { and, eq, sql } from "drizzle-orm";
import { CLAIM, TRANSPARENCY } from "../../config/constants";
import { env } from "../../config/env";
import type { CreateDiplomaInput } from "@certifychain/contract/schemas";
import type { DiplomaDTO } from "@certifychain/contract/dto";
import {
  buildSdV2Emission,
  buildSdV3Emission,
  envelopePqSigner,
  keyVault,
  resolveSchoolSigner,
  type DiplomaPayload,
} from "../../crypto";
import { db, type DB } from "../../db/client";
import {
  type Diploma,
  diplomas,
  issuanceLog,
  schools,
  students,
  studentEmailAliases,
} from "../../db/schema";
import { fail } from "../../lib/http-error";
import { uuid, urlToken } from "../../lib/ids";
import { sendDiplomaClaimEmail, sendDiplomaNotification } from "../../lib/mailer";
import { logger } from "../../lib/logger";
import { recordAudit } from "../audit/audit.service";
import { ensureSchoolPqMaterial } from "../schools/schools.service";
import { buildIssuanceLeaf } from "../transparency/merkle";

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
 * payload, signs it through the school's Signer (the private key never surfaces),
 * finds-or-creates the holder student, persists the diploma, audits the issuance
 * and notifies the holder.
 */
/** Injectable dependencies (default = production `db`). The transaction runner is
    the seam the transactionality test drives with a tx that fails the log insert. */
export interface IssueDiplomaDeps {
  db: DB;
}

export async function issueDiploma(
  schoolId: string,
  input: CreateDiplomaInput,
  deps: IssueDiplomaDeps = { db },
): Promise<DiplomaDTO> {
  const { db: database } = deps;
  const [school] = await database.select().from(schools).where(eq(schools.id, schoolId)).limit(1);
  // Resolve the school's signer PER ROW (envelope legacy blob, envelope ref, or a
  // KMS key name) — a school with no usable key material is treated exactly like a
  // non-approved one. The private key never surfaces here (v2.md §V2-1).
  const signing = school ? resolveSchoolSigner(school) : null;
  if (!school || school.status !== "approved" || !school.publicKey || !signing) {
    throw fail.schoolNotApproved();
  }
  // Transparency freeze (v2.md §V3-6): a school that flagged a rogue issuance is
  // barred from emitting until an admin unfreezes. Placed AFTER the approved gate so
  // the historical `school_not_approved` behaviour is strictly unchanged (S1).
  if (school.issuanceFrozenAt) throw fail.issuanceFrozen();

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

  // ── V4 — post-quantum hybrid gate (v2.md §V4-1) ─────────────────────────
  // `PQ_POLICY` is applied ONLY here, at emission — never at verification
  // (packages/shared is policy-blind by design: it deduces the hybrid
  // requirement from `payload.v` alone, so a diploma's proof_version, once
  // written, verifies exactly the same forever regardless of a LATER policy
  // change). "off" never touches PQ material.
  //
  // "dual-sign" is the ROLLOUT rung ("signe les deux, n'exige que Ed25519"):
  // it must never turn a PQ hiccup into a refused issuance, otherwise it is as
  // risky as "require" and the three-rung ladder collapses to two. So EVERY PQ
  // step is tolerant here — minting the school's ML-DSA-65 key AND signing with
  // it — and a failure at either step falls back to a freshly built v2 emission
  // for THIS diploma. "require" has zero tolerance: the same failures abort the
  // emission rather than ever committing a non-v3 proof.
  //
  // ⚠️ That fallback is IRREVERSIBLE (v2.md §V4-0): a diploma emitted without a
  // PQ signature can never be re-signed — the school's key may be gone, and its
  // consent with it. A `logger.error` line is therefore not enough (logs rotate,
  // and nobody diffs them against the diploma table). The degradation is also
  // written to the `audit` table as `pq_degraded`, right next to the issuance
  // entry and only once the diploma has actually COMMITTED, so an operator can
  // answer "which diplomas did we emit unprotected, and why" years later.
  let pq: { ref: string; publicKeyPq: string; certificatePq: string } | null = null;
  let pqDegradation: { stage: "provision" | "sign"; error: string } | null = null;
  if (env.PQ_POLICY !== "off") {
    try {
      pq = await ensureSchoolPqMaterial(school, database);
    } catch (e) {
      if (env.PQ_POLICY === "require") throw e;
      pqDegradation = { stage: "provision", error: String(e) };
      logger.error("diploma.pq_provision_failed", { error: String(e), schoolId });
    }
  }

  // ── ed25519-sd-v2 / ed25519-sd-v3 emission (v2.md §V1-4 / §V4-1) ────────
  // The pure core (crypto/sd-emission.ts) builds ALL 7 disclosures — including
  // null-valued fields — and a lexicographically SORTED `_sd`. Salts stay secret
  // at rest: the dict is envelope-encrypted before persisting. v3 is v2 PLUS a
  // second, ML-DSA-65 signature over the SAME payload hash — hybrid "AND".
  const fields = {
    holderName: payload.holderName,
    holderEmail: payload.holderEmail,
    programTitle: payload.programTitle,
    mention: payload.mention,
    rncp: payload.rncp,
    issuedAt: payload.issuedAt,
    externalId: payload.externalId,
  };
  let emission = pq
    ? buildSdV3Emission(diplomaId, schoolId, fields)
    : buildSdV2Emission(diplomaId, schoolId, fields);

  // PQ signature FIRST: the v3 payload hash commits to `v: "sd-v3"`, so a v2
  // fallback cannot reuse it — the emission has to be rebuilt, and the single
  // Ed25519 signature below must then cover the hash we actually persist.
  let signaturePq: string | null = null;
  if (pq) {
    try {
      signaturePq = await envelopePqSigner.signPq(pq.ref, Buffer.from(emission.payloadHash, "hex"));
    } catch (e) {
      if (env.PQ_POLICY === "require") throw e;
      pqDegradation = { stage: "sign", error: String(e) };
      logger.error("diploma.pq_sign_failed", { error: String(e), schoolId });
      pq = null;
      emission = buildSdV2Emission(diplomaId, schoolId, fields);
    }
  }
  const useV3 = pq !== null;

  const { disclosureByField, payloadHash } = emission;
  const signature = await signing.signer.sign(signing.ref, Buffer.from(payloadHash, "hex"));
  const disclosuresEncrypted = keyVault.encrypt(JSON.stringify(disclosureByField));

  // Transparency-log leaf (v2.md §V3-1): built from the SAME `issuedAt` string the
  // disclosure carries, so the browser can rebind the leaf when it is revealed. No
  // PII — the log is public. Computed here, appended inside `persist()` below.
  const { leafHashHex } = buildIssuanceLeaf({
    diplomaId,
    schoolId,
    payloadHash,
    signature,
    issuedAt: payload.issuedAt,
  });

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
    database.transaction(async (tx) => {
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
          signaturePq,
          proofVersion: useV3 ? "v3" : "v2",
          disclosuresEncrypted,
          // Kept as-is: the holder secret binds the nonce proof, orthogonal to SD.
          encryptedHolderSecret: keyVault.encrypt(urlToken(32)),
          status: "active",
        })
        .returning();
      if (!inserted) throw fail.internal();

      // ── Transparency log append (v2.md §V3-2), SAME tx (design D2) ──────────
      // A failure here rolls the diploma back — it never existed. The advisory
      // xact lock serializes leaf_index assignment so every committed prefix is
      // contiguous (D1): the lock is held until commit, so no two issuances can
      // interleave, and a rollback frees the index for the next MAX+1.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${TRANSPARENCY.LOCK_KEY})`);
      const [maxRow] = await tx
        .select({ next: sql<number>`coalesce(max(${issuanceLog.leafIndex}) + 1, 0)` })
        .from(issuanceLog);
      const leafIndex = Number(maxRow?.next ?? 0);
      await tx.insert(issuanceLog).values({ diplomaId, leafIndex, leafHash: leafHashHex });

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

  // Durable trace of an IRREVERSIBLE degradation (v2.md §V4-0): this diploma
  // committed as v2 while the policy asked for a hybrid v3, and it can never be
  // re-signed. Recorded only now, after the transaction committed, so the entry
  // can never point at a diploma that was rolled back. `recordAudit` swallows
  // its own failures — a broken audit write must not undo a valid issuance.
  if (pqDegradation) {
    await recordAudit(
      {
        type: "pq_degraded",
        schoolId,
        diplomaId,
        metadata: {
          policy: env.PQ_POLICY,
          stage: pqDegradation.stage,
          error: pqDegradation.error,
          emittedProofVersion: row.proofVersion,
        },
      },
      { db: database },
    );
  }

  // Fire-and-forget holder notification; a mail failure must not fail issuance.
  // The student wallet is now its own app/origin (root path), not /wallet on the web.
  // Route to whichever address is actually live: the personal login email once
  // the holder has claimed (durable), else the claim invite to the school
  // address that triggered THIS issuance (skipped on repeat issuance to an
  // already-pending alias, so the holder isn't re-mailed the same invite).
  const walletUrl = env.WALLET_ORIGIN;
  if (existingAlias?.verifiedAt) {
    const [holder] = await database
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
