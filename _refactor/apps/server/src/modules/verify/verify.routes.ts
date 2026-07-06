import { zValidator } from "../../lib/validator";
import { and, eq, gt, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { VerifyProofSchema } from "@certifychain/contract/schemas";
import type {
  VerificationChallengeDTO,
  VerificationResultDTO,
} from "@certifychain/contract/dto";
import type { VerificationResult } from "@certifychain/contract/enums";
import type { AppEnv } from "../../http/types";
import { RATE_LIMIT, VERIFICATION } from "../../config/constants";
import { db } from "../../db/client";
import {
  diplomas,
  schools,
  shareLinks,
  verificationNonces,
  type Diploma,
  type School,
} from "../../db/schema";
import {
  keyVault,
  proofEngine,
  verifySchoolCertificate,
} from "../../crypto";
import { anonymizeIp, clientIp, shortUserAgent } from "../../lib/net";
import { rateLimit } from "../../middleware/rate-limit";
import { recordAudit } from "../audit/audit.service";

/**
 * Public verification module (no auth, no CSRF). Implements the cahier-des-charges
 * nonce protocol: a recruiter first asks for a single-use challenge nonce, then
 * submits a proof bound to that nonce. The document content is never disclosed —
 * only a minimal, RGPD-safe attestation is returned.
 */
export const verifyRoutes = new Hono<AppEnv>()

// Coarse per-IP limit for the whole public (anonymous) surface.
  .use("*", rateLimit({ key: "verify", ...RATE_LIMIT.VERIFY_IP }))

/**
 * POST /verify/:token/challenge
 * Mints a single-use nonce. We always create one — even for an unknown token —
 * so a caller cannot probe which links exist (no enumeration leak).
 */
  .post("/:token/challenge", async (c) => {
  const token = c.req.param("token");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + VERIFICATION.NONCE_TTL_SECONDS * 1000);
  const nonce = proofEngine.generateNonce();

  await db.insert(verificationNonces).values({
    shareToken: token,
    nonce,
    expiresAt,
  });

  const body: VerificationChallengeDTO = {
    nonce,
    expiresAt: expiresAt.toISOString(),
  };
  return c.json(body);
  })

/**
 * POST /verify/:token/proof
 * Atomically consumes the nonce, then runs the verification pipeline. Every
 * outcome is audited with anonymized actor data.
 */
  .post("/:token/proof", zValidator("json", VerifyProofSchema), async (c) => {
  const token = c.req.param("token");
  const { nonce } = c.req.valid("json");
  const now = new Date();

  const ipHash = anonymizeIp(clientIp(c));
  const userAgent = shortUserAgent(c);

  let school: School | undefined;
  let diploma: Diploma | undefined;

  // NOTE: pas d'annotation `Promise<Response>` ici — elle effacerait le type
  // de réponse inféré de `c.json` et casserait l'inférence RPC (hc) de la route.
  const finish = async (result: VerificationResult) => {
    await recordAudit({
      type: "verification",
      result,
      schoolId: school?.id,
      diplomaId: diploma?.id,
      anonymizedSubject: ipHash,
      ipHash,
      userAgent,
      metadata: { engine: proofEngine.id },
    });
    const body: VerificationResultDTO = { result, engine: proofEngine.id };
    return c.json(body);
  };

  // (a) Atomic single-use consume. A captured/replayed/expired/unknown nonce
  // matches no row and is rejected as "invalid".
  const consumed = await db
    .update(verificationNonces)
    .set({ usedAt: now })
    .where(
      and(
        eq(verificationNonces.nonce, nonce),
        eq(verificationNonces.shareToken, token),
        isNull(verificationNonces.usedAt),
        gt(verificationNonces.expiresAt, now),
      ),
    )
    .returning({ id: verificationNonces.id });
  if (consumed.length === 0) return finish("invalid");

  // (b) Resolve the share link.
  const [link] = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);
  if (!link || link.revoked) return finish("not_found");
  if (link.expiresAt !== null && link.expiresAt <= now) return finish("expired");

  // (c) Resolve the diploma + issuing school.
  const [diplomaRow] = await db
    .select()
    .from(diplomas)
    .where(eq(diplomas.id, link.diplomaId))
    .limit(1);
  if (!diplomaRow) return finish("not_found");
  diploma = diplomaRow;
  if (diploma.status === "revoked") return finish("revoked");

  const [schoolRow] = await db
    .select()
    .from(schools)
    .where(eq(schools.id, diploma.schoolId))
    .limit(1);
  if (
    !schoolRow ||
    schoolRow.status === "revoked" ||
    !schoolRow.publicKey ||
    !schoolRow.certificate ||
    !schoolRow.approvedAt
  ) {
    return finish("not_found");
  }
  school = schoolRow;

  // (d) Verify the cryptographic proof bound to this nonce.
  const holderSecret = keyVault.decryptToString(diploma.encryptedHolderSecret);
  const proof = proofEngine.buildProof({
    nonce,
    holderSecret,
    signatureB64: diploma.signature,
  });
  // The guard above narrowed these to non-null on `schoolRow`.
  const ok = proofEngine.verifyProof({
    publicKeyPem: schoolRow.publicKey,
    payloadHashHex: diploma.payloadHash,
    signatureB64: diploma.signature,
    nonce,
    holderSecret,
    proof,
  });
  if (!ok) return finish("invalid");

  // The root certificate was signed over issuedAt = the activation/seed date,
  // i.e. the YYYY-MM-DD of the school's approval.
  const certOk = verifySchoolCertificate(
    {
      schoolId: schoolRow.id,
      publicKey: schoolRow.publicKey,
      name: schoolRow.name,
      issuedAt: schoolRow.approvedAt.toISOString().slice(0, 10),
    },
    schoolRow.certificate,
  );
  // Root-of-trust is a hard gate, not a cosmetic flag: an issuer whose certificate
  // does not chain to the CertifyChain root is not trusted (cahier §4 step 5).
  if (!certOk) return finish("not_found");

  // (e) Verified — disclose only the minimal attestation.
  await recordAudit({
    type: "verification",
    result: "verified",
    schoolId: school.id,
    diplomaId: diploma.id,
    anonymizedSubject: ipHash,
    ipHash,
    userAgent,
    metadata: { engine: proofEngine.id },
  });
  const body: VerificationResultDTO = {
    result: "verified",
    engine: proofEngine.id,
    diploma: {
      holderName: diploma.holderName,
      programTitle: diploma.programTitle,
      mention: diploma.mention,
      rncp: diploma.rncp,
      issuedAt: diploma.issuedAt,
      schoolName: school.name,
      issuerCertificateValid: certOk,
    },
  };
  return c.json(body);
  })
