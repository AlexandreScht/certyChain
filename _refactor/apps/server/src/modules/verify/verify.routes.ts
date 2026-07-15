import { zValidator } from "../../lib/validator";
import { and, eq, gt, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { verifyProofBundle } from "@certifychain/shared/crypto/verify-bundle";
import { VerifyProofSchema } from "@certifychain/contract/schemas";
import type {
  ProofBundleDTO,
  RevocationStatusDTO,
  VerificationChallengeDTO,
  VerificationResultDTO,
} from "@certifychain/contract/dto";
import type { VerificationResult } from "@certifychain/contract/enums";
import type { AppEnv } from "../../http/types";
import { env } from "../../config/env";
import { RATE_LIMIT, VERIFICATION } from "../../config/constants";
import { db } from "../../db/client";
import {
  diplomas,
  issuanceLog,
  schools,
  shareLinks,
  verificationNonces,
  type Diploma,
  type School,
} from "../../db/schema";
import {
  certifychainRootPublicKeyPem,
  digestOf,
  ed25519NonceEngine,
  engineFor,
  keyVault,
  verifySchoolCertificate,
  type Disclosure,
  type ProofEngine,
} from "../../crypto";
import { fail } from "../../lib/http-error";
import { anonymizeIp, clientIp, shortUserAgent } from "../../lib/net";
import { rateLimit } from "../../middleware/rate-limit";
import { recordAudit } from "../audit/audit.service";
import { checkpointService, toLogCheckpointDTO } from "../transparency/checkpoint.service";
import { inclusionProofHex } from "../transparency/merkle";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public verification module (no auth, no CSRF). Implements the cahier-des-charges
 * nonce protocol: a recruiter first asks for a single-use challenge nonce, then
 * submits a proof bound to that nonce.
 *
 * v1 diplomas: minimal, server-attested disclosure (strictly unchanged).
 * v2 diplomas (`ed25519-sd-v2`): the response carries a self-contained proof
 * bundle the recruiter verifies IN THEIR BROWSER (same `verifyProofBundle` the
 * server runs here for its own verdict — one implementation, no divergence).
 */
export const verifyRoutes = new Hono<AppEnv>()

// Coarse per-IP limit for the whole public (anonymous) surface.
  .use("*", rateLimit({ key: "verify", ...RATE_LIMIT.VERIFY_IP }))

/**
 * GET /verify/revocation/:diplomaId
 * A bounded existence/revocation oracle for the (browser) verifier to re-check a
 * bundle. ONLY active diplomas return 200; revoked AND unknown/malformed ids all
 * return a UNIFORM 404 (anti-enumeration). Never reveals any diploma field.
 */
  .get(
    "/revocation/:diplomaId",
    rateLimit({ key: "verify_revocation", ...RATE_LIMIT.VERIFY_REVOCATION_IP }),
    async (c) => {
      const diplomaId = c.req.param("diplomaId");
      // Guard the uuid shape ourselves (a bad value would otherwise raise a DB
      // error) and fold malformed → the SAME 404 as unknown/revoked.
      if (!UUID_RE.test(diplomaId)) throw fail.notFound();

      const [row] = await db
        .select({ status: diplomas.status })
        .from(diplomas)
        .where(eq(diplomas.id, diplomaId))
        .limit(1);
      if (!row || row.status === "revoked") throw fail.notFound();

      const body: RevocationStatusDTO = {
        status: "active",
        checkedAt: new Date().toISOString(),
      };
      return c.json(body);
    },
  )

/**
 * POST /verify/:token/challenge
 * Mints a single-use nonce. We always create one — even for an unknown token —
 * so a caller cannot probe which links exist (no enumeration leak).
 */
  .post("/:token/challenge", async (c) => {
  const token = c.req.param("token");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + VERIFICATION.NONCE_TTL_SECONDS * 1000);
  // Nonce generation is engine-agnostic (identical bytes in both engines).
  const nonce = ed25519NonceEngine.generateNonce();

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
  // Default to the legacy engine until the diploma (hence its version) is known.
  let engine: ProofEngine = ed25519NonceEngine;

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
      metadata: { engine: engine.id },
    });
    const body: VerificationResultDTO = { result, engine: engine.id, proofBundle: null };
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
  const proofVersion = diploma.proofVersion === "v2" ? "v2" : "v1";
  engine = engineFor(proofVersion);
  // v1 revoked diplomas fail closed here, strictly as before. v2 diplomas keep
  // producing a (cryptographically valid) bundle carrying `revocation: revoked`
  // so the recruiter can still verify the signature offline while seeing it's
  // revoked — the honest V1 narrative (crypto ≠ revocation).
  if (proofVersion === "v1" && diploma.status === "revoked") return finish("revoked");

  const [schoolRow] = await db
    .select()
    .from(schools)
    .where(eq(schools.id, diploma.schoolId))
    .limit(1);
  // Only an `approved` issuer is trusted: a school that was rejected/revoked
  // AFTER approval keeps its keys in DB, but the platform withdrew its trust —
  // its diplomas must stop verifying (aligned with the login/refresh gates).
  if (
    !schoolRow ||
    schoolRow.status !== "approved" ||
    !schoolRow.publicKey ||
    !schoolRow.certificate ||
    !schoolRow.approvedAt
  ) {
    return finish("not_found");
  }
  school = schoolRow;

  // (d) Verify the cryptographic proof bound to this nonce.
  const holderSecret = keyVault.decryptToString(diploma.encryptedHolderSecret);
  const proof = engine.buildProof({
    nonce,
    holderSecret,
    signatureB64: diploma.signature,
  });
  // The guard above narrowed these to non-null on `schoolRow`.
  const ok = engine.verifyProof({
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
  const certIssuedAt = schoolRow.approvedAt.toISOString().slice(0, 10);
  const certOk = verifySchoolCertificate(
    {
      schoolId: schoolRow.id,
      publicKey: schoolRow.publicKey,
      name: schoolRow.name,
      issuedAt: certIssuedAt,
    },
    schoolRow.certificate,
  );
  // Root-of-trust is a hard gate, not a cosmetic flag: an issuer whose certificate
  // does not chain to the CertifyChain root is not trusted (cahier §4 step 5).
  if (!certOk) return finish("not_found");

  /* ── v2: selective disclosure — build the bundle and let the SHARED verifier
     decide the verdict (same function the recruiter's browser runs). ───────── */
  if (proofVersion === "v2") {
    if (!diploma.disclosuresEncrypted) return finish("invalid");
    let allDisclosures: Record<string, Disclosure>;
    try {
      allDisclosures = JSON.parse(
        keyVault.decryptToString(diploma.disclosuresEncrypted),
      ) as Record<string, Disclosure>;
    } catch {
      return finish("invalid");
    }

    // Only the fields the holder chose for THIS recruiter (never leak the rest).
    const chosen = link.disclosedFields.filter((f) => f in allDisclosures);
    const disclosures: Disclosure[] = [];
    for (const field of chosen) {
      const d = allDisclosures[field];
      if (d !== undefined) disclosures.push(d);
    }
    // `_sd` is recomputed from ALL 7 disclosures (sorted) → reproduces the exact
    // signed payload; hidden fields appear only as opaque digests.
    const sd = Object.values(allDisclosures).map(digestOf).sort();

    const bundle: ProofBundleDTO = {
      engine: "ed25519-sd-v2",
      payload: {
        v: "sd-v2",
        h: "sha-256",
        id: diploma.id,
        schoolId: diploma.schoolId,
        _sd: sd,
      },
      signature: diploma.signature,
      disclosures,
      school: {
        id: schoolRow.id,
        name: schoolRow.name,
        publicKey: schoolRow.publicKey,
        certificate: schoolRow.certificate,
        certIssuedAt,
      },
      root: { publicKey: certifychainRootPublicKeyPem() },
      revocation: {
        checkedAt: now.toISOString(),
        status: diploma.status === "revoked" ? "revoked" : "active",
        source: `${env.PUBLIC_API_ORIGIN}/verify/revocation/${diploma.id}`,
      },
    };

    // ── Transparency proof (v2.md §V3-4) ────────────────────────────────────
    // Attach an inclusion proof against a signed checkpoint covering the leaf.
    // A diploma issued before the log (no issuance_log row) simply carries `null`.
    // NEVER put the `issuedAt` VALUE here — only its hash lives in `leafHash`, so
    // the substring-leak guard stays green when the holder masks `issuedAt` (D5).
    const [logRow] = await db
      .select({ leafIndex: issuanceLog.leafIndex, leafHash: issuanceLog.leafHash })
      .from(issuanceLog)
      .where(eq(issuanceLog.diplomaId, diploma.id))
      .limit(1);
    if (logRow) {
      const leafIndex = Number(logRow.leafIndex);
      const checkpoint = await checkpointService.ensureCheckpointCovering(leafIndex);
      const leaves = await checkpointService.snapshotLeaves(checkpoint.treeSize);
      bundle.transparency = {
        leafIndex,
        leafHash: logRow.leafHash,
        auditPath: inclusionProofHex(leaves, leafIndex),
        checkpoint: toLogCheckpointDTO(checkpoint),
      };
    } else {
      bundle.transparency = null;
    }

    const outcome = await verifyProofBundle(bundle);
    if (!outcome.ok) return finish("invalid");

    const result: VerificationResult = diploma.status === "revoked" ? "revoked" : "verified";
    await recordAudit({
      type: "verification",
      result,
      schoolId: school.id,
      diplomaId: diploma.id,
      anonymizedSubject: ipHash,
      ipHash,
      userAgent,
      metadata: { engine: engine.id },
    });
    const body: VerificationResultDTO = {
      result,
      engine: engine.id,
      proofBundle: bundle,
      disclosed: outcome.disclosed,
      hiddenCount: outcome.hidden,
    };
    return c.json(body);
  }

  // (e) v1 — verified: disclose only the minimal, server-attested attestation.
  await recordAudit({
    type: "verification",
    result: "verified",
    schoolId: school.id,
    diplomaId: diploma.id,
    anonymizedSubject: ipHash,
    ipHash,
    userAgent,
    metadata: { engine: engine.id },
  });
  const body: VerificationResultDTO = {
    result: "verified",
    engine: engine.id,
    proofBundle: null,
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
