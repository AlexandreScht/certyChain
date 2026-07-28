import { zValidator } from "../../lib/validator";
import { and, eq, gt, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { verifyProofBundle, type TrustedRoots } from "@certifychain/shared/crypto/verify-bundle";
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
  certifychainRootPqPublicKeyB64,
  certifychainTrustedEd25519Roots,
  certifychainTrustedMlDsaRoots,
  digestOf,
  ed25519NonceEngine,
  engineFor,
  findTrustedEd25519RootFor,
  keyVault,
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
 * The CertifyChain PKI root(s) THIS SERVER trusts (audit 2026-07-27 root-
 * pinning fix, extended 2026-07-28 to a real list) — computed once from
 * `config/env.ts`, NEVER read back from a bundle under verification
 * (`verifyProofBundle`/`verifyTransparency` reject before checking anything
 * else when a bundle's own root isn't in this list).
 *
 * A LIST, not a single key: root rotation (docs/security/root-secrets-
 * rotation.md §4) keeps an outgoing root here alongside the incoming one
 * during the switch-over window, so a school certificate signed under
 * EITHER still verifies — `CERTIFYCHAIN_ROOT_PUBLIC_KEY` /
 * `CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY` are comma-separated in `.env` (same
 * convention as the browser's `NEXT_PUBLIC_*` pinning,
 * `apps/client/web/src/lib/trusted-roots.ts`) and `config/env.ts` splits them
 * once into `certifychainRootPublicKeys` / `certifychainRootPqPublicKeys`.
 * Every `.env` predating this feature has a single, comma-free value, which
 * yields a one-element list here — unchanged behaviour.
 */
const SERVER_TRUSTED_ROOTS: TrustedRoots = {
  ed25519: certifychainTrustedEd25519Roots(),
  mlDsa65: env.pqEnabled ? certifychainTrustedMlDsaRoots() : [],
};

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
  const proofVersion =
    diploma.proofVersion === "v3" ? "v3" : diploma.proofVersion === "v2" ? "v2" : "v1";
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
  // Tries EVERY currently-trusted root (current signing key + any coexisting
  // outgoing one, docs/security/root-secrets-rotation.md §4) — a school
  // approved BEFORE a rotation was certified under the OLD root, so only the
  // current key would wrongly reject it. `matchedRootPem` is also the exact
  // key a v2/v3 bundle must embed below (never assume "current" for an
  // arbitrary school — see `findTrustedEd25519RootFor`'s doc).
  const matchedRootPem = findTrustedEd25519RootFor(
    {
      schoolId: schoolRow.id,
      publicKey: schoolRow.publicKey,
      name: schoolRow.name,
      issuedAt: certIssuedAt,
    },
    schoolRow.certificate,
  );
  // Root-of-trust is a hard gate, not a cosmetic flag: an issuer whose certificate
  // does not chain to ANY trusted CertifyChain root is not trusted (cahier §4 step 5).
  if (matchedRootPem === null) return finish("not_found");
  // Narrowed non-null by the guard above — kept as a named boolean (rather
  // than a bare literal) for the v1 response DTO's `issuerCertificateValid`.
  const certOk = true;

  /* ── v2/v3: selective disclosure — build the bundle and let the SHARED
     verifier decide the verdict (same function the recruiter's browser runs).
     v3 additionally carries the ML-DSA-65 material (v2.md §V4-1); the shared
     verifier deduces the hybrid requirement from `payload.v` alone. ───────── */
  if (proofVersion === "v2" || proofVersion === "v3") {
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

    // v3 = v2 + ML-DSA-65 (v2.md §V4-1). The root's PQ public key is attached
    // whenever PQ is enabled server-side — NOT only for v3 diplomas — because a
    // v2 diploma's transparency checkpoint (signed independently of any single
    // diploma's version) may itself already carry a post-quantum signature.
    const isV3 = proofVersion === "v3";
    const bundle: ProofBundleDTO = {
      engine: isV3 ? "ed25519-sd-v3" : "ed25519-sd-v2",
      payload: {
        v: isV3 ? "sd-v3" : "sd-v2",
        h: "sha-256",
        id: diploma.id,
        schoolId: diploma.schoolId,
        _sd: sd,
      },
      signature: diploma.signature,
      ...(isV3 && diploma.signaturePq ? { signaturePq: diploma.signaturePq } : {}),
      disclosures,
      school: {
        id: schoolRow.id,
        name: schoolRow.name,
        publicKey: schoolRow.publicKey,
        certificate: schoolRow.certificate,
        certIssuedAt,
        ...(isV3 && schoolRow.publicKeyPq && schoolRow.certificatePq
          ? { publicKeyPq: schoolRow.publicKeyPq, certificatePq: schoolRow.certificatePq }
          : {}),
      },
      root: {
        // The EXACT root that certified THIS school (found above) — never the
        // "current" convention key blindly: after a rotation, a school
        // certified under the OLD root must still embed the OLD root's key
        // here, or the browser's own cert-chain check (verify-bundle.ts step
        // 2) would fail even though that root is still trusted server-side.
        publicKey: matchedRootPem,
        // PQ root key embedding stays "current" (unlike the Ed25519 one just
        // above): PQ signature verification lives EXCLUSIVELY in
        // `packages/shared` (v2.md §6 piège n°6, see the note in
        // `crypto/keys.ts#certifychainTrustedMlDsaRoots`), so this route
        // cannot itself find which trusted PQ root actually signed a v3
        // school's PQ certificate without duplicating that verification here.
        ...(env.pqEnabled ? { publicKeyPq: certifychainRootPqPublicKeyB64() } : {}),
      },
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

    const outcome = await verifyProofBundle(bundle, SERVER_TRUSTED_ROOTS);
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
