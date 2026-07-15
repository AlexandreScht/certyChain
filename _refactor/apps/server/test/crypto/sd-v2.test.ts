/**
 * ed25519-sd-v2 — emission → proof bundle → shared verifier (v2.md §V1-7.2/7.3/7.4).
 *
 * Uses the REAL production pieces end to end (no DB): `buildSdV2Emission` (the
 * emission core used by diplomas.service), `signDiplomaHash`/`issueSchoolCertificate`
 * (crypto/keys) and `verifyProofBundle` — the SINGLE shared implementation that
 * both the server and the recruiter's browser run.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ProofBundleDTO } from "@certifychain/contract/dto";
import { verifyProofBundle } from "@certifychain/shared/crypto/verify-bundle";
import { makeDisclosure, digestOf } from "../../src/crypto/disclosures";
import { hashSdPayloadV2 } from "../../src/crypto/hashing";
import {
  certifychainRootPublicKeyPem,
  generateEd25519KeyPair,
  issueSchoolCertificate,
  signDiplomaHash,
} from "../../src/crypto/keys";
import {
  ed25519NonceEngine,
  ed25519SdEngine,
  engineFor,
} from "../../src/crypto/proof-engine";
import { buildSdV2Emission, type SdEmissionFields } from "../../src/crypto/sd-emission";

/* ── Fixture: a v2 school + diploma, signed exactly like production ───────── */

const DIPLOMA_ID = "22222222-2222-4222-8222-222222222222";
const SCHOOL_ID = "11111111-1111-4111-8111-111111111111";
const CERT_ISSUED_AT = "2026-07-01";

// Distinctive values so the substring-leak test cannot false-negative.
const FIELDS: SdEmissionFields = {
  holderName: "Zéphyrin Leakcheck",
  holderEmail: "leak.probe@example.com",
  programTitle: "Master Data Science",
  mention: "MentionUltraSecrete",
  rncp: "RNCP-LEAK-77",
  issuedAt: "1999-12-31",
  externalId: "EXT-LEAK-001",
};

interface Fixture {
  bundle: ProofBundleDTO;
  emission: ReturnType<typeof buildSdV2Emission>;
  privateKey: string;
}

function buildFixture(disclosedFields: (keyof SdEmissionFields)[]): Fixture {
  const { publicKey, privateKey } = generateEd25519KeyPair();
  const certificate = issueSchoolCertificate({
    schoolId: SCHOOL_ID,
    publicKey,
    name: "École SD Test",
    issuedAt: CERT_ISSUED_AT,
  });
  const emission = buildSdV2Emission(DIPLOMA_ID, SCHOOL_ID, FIELDS);
  const signature = signDiplomaHash(privateKey, emission.payloadHash);
  const bundle: ProofBundleDTO = {
    engine: "ed25519-sd-v2",
    payload: emission.sdPayload,
    signature,
    disclosures: disclosedFields.map((f) => emission.disclosureByField[f]),
    school: {
      id: SCHOOL_ID,
      name: "École SD Test",
      publicKey,
      certificate,
      certIssuedAt: CERT_ISSUED_AT,
    },
    root: { publicKey: certifychainRootPublicKeyPem() },
    revocation: {
      checkedAt: new Date().toISOString(),
      status: "active",
      source: "http://localhost:4000/verify/revocation/" + DIPLOMA_ID,
    },
  };
  return { bundle, emission, privateKey };
}

describe("ed25519-sd-v2 — emission output", () => {
  it("signs ALL 7 fields, including null-able ones set to null", () => {
    const emission = buildSdV2Emission(DIPLOMA_ID, SCHOOL_ID, {
      ...FIELDS,
      mention: null,
      rncp: null,
      externalId: null,
    });
    assert.equal(emission.sdPayload._sd.length, 7);
    assert.equal(Object.keys(emission.disclosureByField).length, 7);
  });

  it("produces `_sd` SORTED lexicographically (security requirement, not style)", () => {
    for (let i = 0; i < 5; i += 1) {
      const { _sd } = buildSdV2Emission(DIPLOMA_ID, SCHOOL_ID, FIELDS).sdPayload;
      assert.deepEqual(_sd, [..._sd].sort());
      assert.equal(new Set(_sd).size, 7);
    }
  });

  it("payloadHash = hashSdPayloadV2(sdPayload) (what the school actually signs)", () => {
    const emission = buildSdV2Emission(DIPLOMA_ID, SCHOOL_ID, FIELDS);
    assert.equal(emission.payloadHash, hashSdPayloadV2(emission.sdPayload));
  });
});

describe("ed25519-sd-v2 — verifyProofBundle (shared implementation)", () => {
  it("accepts a genuine bundle and returns disclosed + hidden count", async () => {
    const { bundle } = buildFixture(["holderName", "programTitle"]);
    const outcome = await verifyProofBundle(bundle);
    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      assert.deepEqual(outcome.disclosed, {
        holderName: FIELDS.holderName,
        programTitle: FIELDS.programTitle,
      });
      assert.equal(outcome.hidden, 5);
    }
  });

  it("rejects a modified disclosure value", async () => {
    const { bundle } = buildFixture(["holderName"]);
    bundle.disclosures = [makeDisclosure("holderName", "Eve L'Usurpatrice")];
    const outcome = await verifyProofBundle(bundle);
    assert.equal(outcome.ok, false);
  });

  it("rejects a disclosure whose digest is NOT in _sd (invented field)", async () => {
    const { bundle } = buildFixture(["holderName"]);
    bundle.disclosures.push(makeDisclosure("bogusField", "anything"));
    assert.equal((await verifyProofBundle(bundle)).ok, false);
  });

  it("rejects two disclosures bearing the same name (anti-substitution)", async () => {
    // Craft a signed payload that legitimately contains BOTH digests, so the
    // rejection can only come from the duplicate-name rule.
    const { publicKey, privateKey } = generateEd25519KeyPair();
    const certificate = issueSchoolCertificate({
      schoolId: SCHOOL_ID,
      publicKey,
      name: "École SD Test",
      issuedAt: CERT_ISSUED_AT,
    });
    const emission = buildSdV2Emission(DIPLOMA_ID, SCHOOL_ID, FIELDS);
    const twin = makeDisclosure("holderName", "Un Autre Nom");
    const payload = {
      ...emission.sdPayload,
      _sd: [...emission.sdPayload._sd, digestOf(twin)].sort(),
    };
    const bundle: ProofBundleDTO = {
      engine: "ed25519-sd-v2",
      payload,
      signature: signDiplomaHash(privateKey, hashSdPayloadV2(payload)),
      disclosures: [emission.disclosureByField.holderName, twin],
      school: {
        id: SCHOOL_ID,
        name: "École SD Test",
        publicKey,
        certificate,
        certIssuedAt: CERT_ISSUED_AT,
      },
      root: { publicKey: certifychainRootPublicKeyPem() },
      revocation: { checkedAt: new Date().toISOString(), status: "active", source: "x" },
    };
    const outcome = await verifyProofBundle(bundle);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.match(outcome.reason, /same field/);
  });

  it("rejects a duplicate identical disclosure", async () => {
    const { bundle, emission } = buildFixture(["holderName"]);
    bundle.disclosures = [
      emission.disclosureByField.holderName,
      emission.disclosureByField.holderName,
    ];
    assert.equal((await verifyProofBundle(bundle)).ok, false);
  });

  it("rejects a signature from ANOTHER school", async () => {
    const { bundle, emission } = buildFixture(["holderName"]);
    const { privateKey: foreign } = generateEd25519KeyPair();
    bundle.signature = signDiplomaHash(foreign, emission.payloadHash);
    assert.equal((await verifyProofBundle(bundle)).ok, false);
  });

  it("rejects a certificate from another school glued onto the bundle", async () => {
    const { bundle } = buildFixture(["holderName"]);
    const other = generateEd25519KeyPair();
    bundle.school.certificate = issueSchoolCertificate({
      schoolId: SCHOOL_ID,
      publicKey: other.publicKey, // certifies a DIFFERENT key than school.publicKey
      name: "École SD Test",
      issuedAt: CERT_ISSUED_AT,
    });
    const outcome = await verifyProofBundle(bundle);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.match(outcome.reason, /root/);
  });

  it("rejects payload.schoolId ≠ school.id (payload re-glued on another cert)", async () => {
    const { bundle } = buildFixture(["holderName"]);
    bundle.payload = { ...bundle.payload, schoolId: "99999999-9999-4999-8999-999999999999" };
    const outcome = await verifyProofBundle(bundle);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.match(outcome.reason, /schoolId/);
  });

  it("rejects an unknown payload version or hash algorithm", async () => {
    const { bundle: b1 } = buildFixture([]);
    b1.payload = { ...b1.payload, v: "sd-v3" as "sd-v2" };
    assert.equal((await verifyProofBundle(b1)).ok, false);
    const { bundle: b2 } = buildFixture([]);
    b2.payload = { ...b2.payload, h: "sha-512" as "sha-256" };
    assert.equal((await verifyProofBundle(b2)).ok, false);
  });

  it("rejects a tampered _sd list (signature no longer covers it)", async () => {
    const { bundle } = buildFixture(["holderName"]);
    const sd = [...bundle.payload._sd];
    sd[0] = digestOf(makeDisclosure("mention", "TB"));
    bundle.payload = { ...bundle.payload, _sd: sd.sort() };
    assert.equal((await verifyProofBundle(bundle)).ok, false);
  });
});

describe("non-régression v1 — the nonce engine did NOT move (v2.md §V1-7.3)", () => {
  it("engineFor resolves per diploma version", () => {
    assert.equal(engineFor("v1"), ed25519NonceEngine);
    assert.equal(engineFor("v2"), ed25519SdEngine);
    assert.equal(engineFor("v1").id, "ed25519-nonce-v1");
    assert.equal(engineFor("v2").id, "ed25519-sd-v2");
  });

  it("a v1 diploma verifies exactly as before through engineFor('v1')", () => {
    const { publicKey, privateKey } = generateEd25519KeyPair();
    // v1 signs the monolithic DiplomaPayload hash — reproduced here byte for byte.
    const payloadHashHex = "a".repeat(64);
    const signatureB64 = signDiplomaHash(privateKey, payloadHashHex);
    const engine = engineFor("v1");
    const nonce = engine.generateNonce();
    const holderSecret = "holder-secret-xyz";
    const proof = engine.buildProof({ nonce, holderSecret, signatureB64 });
    assert.equal(
      engine.verifyProof({
        publicKeyPem: publicKey,
        payloadHashHex,
        signatureB64,
        nonce,
        holderSecret,
        proof,
      }),
      true,
    );
    // Replay on a fresh nonce still fails — the anti-replay contract is intact.
    assert.equal(
      engine.verifyProof({
        publicKeyPem: publicKey,
        payloadHashHex,
        signatureB64,
        nonce: engine.generateNonce(),
        holderSecret,
        proof,
      }),
      false,
    );
  });

  it("the v2 engine keeps the exact same nonce binding semantics", () => {
    const input = { nonce: "n0nce", holderSecret: "s", signatureB64: "sig" };
    assert.equal(ed25519SdEngine.buildProof(input), ed25519NonceEngine.buildProof(input));
  });
});

describe("fuite par sous-chaîne (v2.md §V1-7.4)", () => {
  it("a 1-field share leaks NONE of the 6 other values anywhere in the response JSON", async () => {
    const { bundle } = buildFixture(["programTitle"]);
    assert.equal(bundle.disclosures.length, 1);

    const outcome = await verifyProofBundle(bundle);
    assert.equal(outcome.ok, true);
    if (outcome.ok) assert.equal(outcome.hidden, 6);

    // Serialize the COMPLETE response body shape returned by /verify (v2).
    const responseBody = JSON.stringify({
      result: "verified",
      engine: "ed25519-sd-v2",
      proofBundle: bundle,
      disclosed: outcome.ok ? outcome.disclosed : {},
      hiddenCount: outcome.ok ? outcome.hidden : -1,
    });

    assert.ok(responseBody.includes(FIELDS.programTitle), "the chosen field IS disclosed");
    const hidden = [
      FIELDS.holderName,
      FIELDS.holderEmail,
      FIELDS.mention,
      FIELDS.rncp,
      FIELDS.issuedAt,
      FIELDS.externalId,
    ] as string[];
    for (const value of hidden) {
      assert.ok(!responseBody.includes(value), `leaked hidden value: ${value}`);
    }
  });
});
