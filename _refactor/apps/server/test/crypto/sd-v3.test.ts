/**
 * ed25519-sd-v3 — hybrid post-quantum emission → proof bundle → shared verifier
 * (v2.md §V4-1/§V4-3). Mirrors `sd-v2.test.ts`'s structure: REAL production
 * pieces end to end (no DB) — `buildSdV3Emission` (the emission core used by
 * diplomas.service under `PQ_POLICY != "off"`), `signDiplomaHash` /
 * `issueSchoolCertificate` / `issueSchoolCertificatePq` (crypto/keys), and
 * `verifyProofBundle` — the SINGLE shared implementation the server AND the
 * recruiter's browser both run.
 *
 * Core property under test: hybrid "AND" — altering EITHER signature alone
 * (Ed25519 broken/PQ intact, or PQ broken/Ed25519 intact) must reject. "OR"
 * would only be as strong as the weaker algorithm; this suite proves the
 * verifier never falls back to it.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ProofBundleDTO } from "@certifychain/contract/dto";
import { verifyProofBundle, type TrustedRoots } from "@certifychain/shared/crypto/verify-bundle";
import { mlDsaKeygen, mlDsaSign } from "@certifychain/shared/crypto/ml-dsa";
import { makeDisclosure } from "../../src/crypto/disclosures";
import { canonicalize, hashSdPayloadV3 } from "../../src/crypto/hashing";
import {
  certifychainRootPqPublicKeyB64,
  certifychainRootPublicKeyPem,
  generateEd25519KeyPair,
  issueSchoolCertificate,
  issueSchoolCertificatePq,
  signDiplomaHash,
} from "../../src/crypto/keys";
import { buildSdV2Emission, buildSdV3Emission, type SdEmissionFields } from "../../src/crypto/sd-emission";

/* ── Fixture: a v3 (hybrid) school + diploma, signed exactly like production ── */

const DIPLOMA_ID = "44444444-4444-4444-8444-444444444444";
const SCHOOL_ID = "11111111-1111-4111-8111-111111111111";
const CERT_ISSUED_AT = "2026-07-01";
const SCHOOL_NAME = "École Hybride PQ Test";

// Root pinning (audit 2026-07-27): every fixture below chains to the REAL
// env-configured CertifyChain root, classical AND post-quantum — the trust
// anchor every call under test must supply explicitly.
const TRUSTED_ROOTS: TrustedRoots = {
  ed25519: [certifychainRootPublicKeyPem()],
  mlDsa65: [certifychainRootPqPublicKeyB64()],
};

// Distinctive values so the substring-leak style checks cannot false-negative.
const FIELDS: SdEmissionFields = {
  holderName: "Alix Hybridge",
  holderEmail: "alix.hybridge@example.com",
  programTitle: "Master Cryptographie Post-Quantique",
  mention: "TB",
  rncp: "RNCP-PQ-42",
  issuedAt: "2026-06-30",
  externalId: "EXT-PQ-001",
};

interface Fixture {
  bundle: ProofBundleDTO;
  emission: ReturnType<typeof buildSdV3Emission>;
}

function buildFixture(disclosedFields: (keyof SdEmissionFields)[]): Fixture {
  const { publicKey: ed25519PublicKey, privateKey: ed25519PrivateKey } = generateEd25519KeyPair();
  const { publicKey: pqPublicKey, secretKey: pqSecretKey } = mlDsaKeygen();
  const publicKeyPq = Buffer.from(pqPublicKey).toString("base64");

  const certificate = issueSchoolCertificate({
    schoolId: SCHOOL_ID,
    publicKey: ed25519PublicKey,
    name: SCHOOL_NAME,
    issuedAt: CERT_ISSUED_AT,
  });
  const certificatePq = issueSchoolCertificatePq({
    schoolId: SCHOOL_ID,
    publicKey: publicKeyPq,
    name: SCHOOL_NAME,
    issuedAt: CERT_ISSUED_AT,
  });

  const emission = buildSdV3Emission(DIPLOMA_ID, SCHOOL_ID, FIELDS);
  const signature = signDiplomaHash(ed25519PrivateKey, emission.payloadHash);
  const signaturePq = Buffer.from(
    mlDsaSign(pqSecretKey, Buffer.from(emission.payloadHash, "hex")),
  ).toString("base64");

  const bundle: ProofBundleDTO = {
    engine: "ed25519-sd-v3",
    payload: emission.sdPayload,
    signature,
    signaturePq,
    disclosures: disclosedFields.map((f) => emission.disclosureByField[f]),
    school: {
      id: SCHOOL_ID,
      name: SCHOOL_NAME,
      publicKey: ed25519PublicKey,
      certificate,
      certIssuedAt: CERT_ISSUED_AT,
      publicKeyPq,
      certificatePq,
    },
    root: {
      publicKey: certifychainRootPublicKeyPem(),
      publicKeyPq: certifychainRootPqPublicKeyB64(),
    },
    revocation: {
      checkedAt: new Date().toISOString(),
      status: "active",
      source: `http://localhost:4000/verify/revocation/${DIPLOMA_ID}`,
    },
  };
  return { bundle, emission };
}

describe("ed25519-sd-v3 — emission output", () => {
  it("signs ALL 7 fields with v: 'sd-v3' and a lexicographically sorted _sd", () => {
    const emission = buildSdV3Emission(DIPLOMA_ID, SCHOOL_ID, FIELDS);
    assert.equal(emission.sdPayload.v, "sd-v3");
    assert.equal(emission.sdPayload.h, "sha-256");
    assert.equal(emission.sdPayload._sd.length, 7);
    assert.deepEqual(emission.sdPayload._sd, [...emission.sdPayload._sd].sort());
  });

  it("payloadHash = hashSdPayloadV3(sdPayload) (what BOTH signers actually sign)", () => {
    const emission = buildSdV3Emission(DIPLOMA_ID, SCHOOL_ID, FIELDS);
    assert.equal(emission.payloadHash, hashSdPayloadV3(emission.sdPayload));
  });

  it("v2 and v3 emissions of the SAME fields produce DIFFERENT payload hashes", () => {
    // `v` is part of the canonical signed form — the two must never collide.
    const v2 = buildSdV2Emission(DIPLOMA_ID, SCHOOL_ID, FIELDS);
    const v3 = buildSdV3Emission(DIPLOMA_ID, SCHOOL_ID, FIELDS);
    assert.notEqual(v2.payloadHash, v3.payloadHash);
  });
});

describe("ed25519-sd-v3 — verifyProofBundle hybrid \"AND\" (v2.md §V4-1)", () => {
  it("accepts a genuine hybrid bundle: BOTH signatures verify", async () => {
    const { bundle } = buildFixture(["holderName", "programTitle"]);
    const outcome = await verifyProofBundle(bundle, TRUSTED_ROOTS);
    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      assert.deepEqual(outcome.disclosed, {
        holderName: FIELDS.holderName,
        programTitle: FIELDS.programTitle,
      });
      assert.equal(outcome.hidden, 5);
    }
  });

  it("rejects when ONLY the Ed25519 signature is broken (PQ signature still valid)", async () => {
    const { bundle } = buildFixture(["holderName"]);
    const foreignEd = generateEd25519KeyPair();
    bundle.signature = signDiplomaHash(foreignEd.privateKey, "0".repeat(64));
    const outcome = await verifyProofBundle(bundle, TRUSTED_ROOTS);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.match(outcome.reason, /ed25519|signature/i);
  });

  it("rejects when ONLY the post-quantum signature is broken (Ed25519 signature still valid)", async () => {
    const { bundle, emission } = buildFixture(["holderName"]);
    const foreignPq = mlDsaKeygen();
    bundle.signaturePq = Buffer.from(
      mlDsaSign(foreignPq.secretKey, Buffer.from(emission.payloadHash, "hex")),
    ).toString("base64");
    const outcome = await verifyProofBundle(bundle, TRUSTED_ROOTS);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.match(outcome.reason, /post-quantum/i);
  });

  it("rejects a v3 bundle with NO post-quantum signature at all", async () => {
    const { bundle } = buildFixture(["holderName"]);
    delete bundle.signaturePq;
    const outcome = await verifyProofBundle(bundle, TRUSTED_ROOTS);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.match(outcome.reason, /post-quantum/i);
  });

  it("rejects a v3 bundle whose school PQ certificate is missing", async () => {
    const { bundle } = buildFixture(["holderName"]);
    delete bundle.school.certificatePq;
    const outcome = await verifyProofBundle(bundle, TRUSTED_ROOTS);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.match(outcome.reason, /post-quantum/i);
  });

  it("rejects a v3 bundle where the PQ certificate certifies a DIFFERENT PQ public key", async () => {
    const { bundle } = buildFixture(["holderName"]);
    const impostor = mlDsaKeygen();
    // Swap in an unrelated PQ public key while keeping the (now mismatched) certificate.
    bundle.school.publicKeyPq = Buffer.from(impostor.publicKey).toString("base64");
    const outcome = await verifyProofBundle(bundle, TRUSTED_ROOTS);
    assert.equal(outcome.ok, false);
  });

  it("rejects a school PQ certificate issued by a foreign post-quantum root", async () => {
    const { bundle } = buildFixture(["holderName"]);
    const foreignRoot = mlDsaKeygen();
    // Same EXACT canonical message the shared verifier recomputes — isolates
    // the rejection to "wrong root key", not an incidental message mismatch.
    const certMessage = canonicalize({
      schoolId: SCHOOL_ID,
      publicKey: bundle.school.publicKeyPq,
      name: SCHOOL_NAME,
      issuedAt: CERT_ISSUED_AT,
    });
    bundle.school.certificatePq = Buffer.from(
      mlDsaSign(foreignRoot.secretKey, Buffer.from(certMessage, "utf8")),
    ).toString("base64");
    const outcome = await verifyProofBundle(bundle, TRUSTED_ROOTS);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.match(outcome.reason, /post-quantum root/i);
  });

  it("still enforces the classical selective-disclosure rules on a v3 bundle (tampered disclosure)", async () => {
    const { bundle } = buildFixture(["holderName"]);
    bundle.disclosures = [makeDisclosure("holderName", "Eve L'Usurpatrice PQ")];
    const outcome = await verifyProofBundle(bundle, TRUSTED_ROOTS);
    assert.equal(outcome.ok, false);
  });
});

describe("non-régression v2 — a v2 (non-hybrid) bundle verifies EXACTLY as before", () => {
  it("a v2 bundle with ZERO post-quantum fields still verifies (hybrid check is skipped)", async () => {
    const { publicKey, privateKey } = generateEd25519KeyPair();
    const certificate = issueSchoolCertificate({
      schoolId: SCHOOL_ID,
      publicKey,
      name: SCHOOL_NAME,
      issuedAt: CERT_ISSUED_AT,
    });
    const emission = buildSdV2Emission(DIPLOMA_ID, SCHOOL_ID, FIELDS);
    const signature = signDiplomaHash(privateKey, emission.payloadHash);
    const bundle: ProofBundleDTO = {
      engine: "ed25519-sd-v2",
      payload: emission.sdPayload,
      signature,
      disclosures: [emission.disclosureByField.programTitle],
      school: { id: SCHOOL_ID, name: SCHOOL_NAME, publicKey, certificate, certIssuedAt: CERT_ISSUED_AT },
      root: { publicKey: certifychainRootPublicKeyPem() },
      revocation: { checkedAt: new Date().toISOString(), status: "active", source: "x" },
    };
    assert.equal(bundle.signaturePq, undefined);
    assert.equal(bundle.school.publicKeyPq, undefined);
    assert.equal(bundle.root.publicKeyPq, undefined);
    const outcome = await verifyProofBundle(bundle, TRUSTED_ROOTS);
    assert.equal(outcome.ok, true);
  });

  it("rejects an unknown payload version (neither sd-v2 nor sd-v3)", async () => {
    const { bundle } = buildFixture([]);
    bundle.payload = { ...bundle.payload, v: "sd-v4" as "sd-v3" };
    const outcome = await verifyProofBundle(bundle, TRUSTED_ROOTS);
    assert.equal(outcome.ok, false);
  });
});
