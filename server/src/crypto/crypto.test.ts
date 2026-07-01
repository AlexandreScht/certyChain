/**
 * Unit tests for the cryptographic core (no DB required).
 * Run: pnpm --filter @certifychain/server test
 *
 * Covers envelope encryption, the canonical hash, the PKI root certificate chain,
 * Ed25519 issuance, and the nonce ProofEngine — including every anti-fraud
 * rejection required by the cahier des charges (forged signature, replay,
 * tampered content).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { keyVault } from "./envelope";
import { canonicalize, hashDiplomaPayload, type DiplomaPayload } from "./hashing";
import {
  generateEd25519KeyPair,
  issueSchoolCertificate,
  signDiplomaHash,
  verifyEd25519,
  verifySchoolCertificate,
} from "./keys";
import { proofEngine } from "./proof-engine";

const basePayload: DiplomaPayload = {
  id: "22222222-2222-4222-8222-222222222222",
  schoolId: "11111111-1111-4111-8111-111111111111",
  holderName: "Alex Dubois",
  holderEmail: "alex@example.com",
  programTitle: "Master Data Science",
  mention: "Très Bien",
  rncp: "RNCP34031",
  issuedAt: "2025-07-03",
  externalId: "T-1",
};

describe("envelope encryption (secrets at rest)", () => {
  const secret = "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n";

  it("ciphertext differs from plaintext and round-trips", () => {
    const enc = keyVault.encrypt(secret);
    assert.notEqual(enc, secret);
    assert.equal(keyVault.decryptToString(enc), secret);
  });

  it("uses a fresh IV per call (same plaintext → different ciphertext)", () => {
    assert.notEqual(keyVault.encrypt(secret), keyVault.encrypt(secret));
  });

  it("rejects tampered ciphertext (GCM auth tag)", () => {
    const enc = keyVault.encrypt(secret);
    assert.throws(() => keyVault.decrypt(`${enc.slice(0, -2)}xx`));
  });

  it("rejects a malformed envelope", () => {
    assert.throws(() => keyVault.decrypt("not-a-valid-envelope"));
  });

  it("round-trips binary buffers", () => {
    const buf = Buffer.from([0, 1, 2, 250, 251, 255]);
    assert.deepEqual(keyVault.decrypt(keyVault.encrypt(buf)), buf);
  });
});

describe("canonical hashing", () => {
  it("is deterministic and key-order independent", () => {
    const a = canonicalize({ b: 1, a: { d: 2, c: 3 } });
    const b = canonicalize({ a: { c: 3, d: 2 }, b: 1 });
    assert.equal(a, b);
  });

  it("hash is stable across payload key reordering", () => {
    const reordered: DiplomaPayload = {
      externalId: basePayload.externalId,
      id: basePayload.id,
      mention: basePayload.mention,
      schoolId: basePayload.schoolId,
      holderEmail: basePayload.holderEmail,
      holderName: basePayload.holderName,
      programTitle: basePayload.programTitle,
      rncp: basePayload.rncp,
      issuedAt: basePayload.issuedAt,
    };
    assert.equal(hashDiplomaPayload(basePayload), hashDiplomaPayload(reordered));
  });

  it("any field change yields a different hash", () => {
    const h0 = hashDiplomaPayload(basePayload);
    assert.notEqual(h0, hashDiplomaPayload({ ...basePayload, mention: "Passable" }));
    assert.notEqual(h0, hashDiplomaPayload({ ...basePayload, holderName: "Eve" }));
    assert.notEqual(h0, hashDiplomaPayload({ ...basePayload, mention: null }));
  });

  it("produces a 64-char hex digest", () => {
    assert.match(hashDiplomaPayload(basePayload), /^[0-9a-f]{64}$/);
  });
});

describe("Ed25519 signatures", () => {
  it("verifies a genuine signature and rejects a foreign key", () => {
    const { publicKey, privateKey } = generateEd25519KeyPair();
    const { publicKey: otherPub } = generateEd25519KeyPair();
    const hash = hashDiplomaPayload(basePayload);
    const sig = signDiplomaHash(privateKey, hash);

    assert.equal(verifyEd25519(publicKey, Buffer.from(hash, "hex"), sig), true);
    assert.equal(verifyEd25519(otherPub, Buffer.from(hash, "hex"), sig), false);
  });

  it("rejects a signature over different data", () => {
    const { publicKey, privateKey } = generateEd25519KeyPair();
    const sig = signDiplomaHash(privateKey, hashDiplomaPayload(basePayload));
    const otherHash = hashDiplomaPayload({ ...basePayload, mention: "Bien" });
    assert.equal(verifyEd25519(publicKey, Buffer.from(otherHash, "hex"), sig), false);
  });

  it("never throws on malformed input (returns false)", () => {
    assert.equal(verifyEd25519("not-a-key", Buffer.from("00", "hex"), "bad"), false);
  });
});

describe("PKI root certificate chain", () => {
  const schoolId = "11111111-1111-4111-8111-111111111111";
  const { publicKey } = generateEd25519KeyPair();
  const issuedAt = "2026-06-16";
  const payload = { schoolId, publicKey, name: "École Test", issuedAt };

  it("a root-issued certificate validates against the CertifyChain root", () => {
    const cert = issueSchoolCertificate(payload);
    assert.equal(verifySchoolCertificate(payload, cert), true);
  });

  it("rejects a certificate whose bound fields were tampered", () => {
    const cert = issueSchoolCertificate(payload);
    assert.equal(verifySchoolCertificate({ ...payload, name: "École Pirate" }, cert), false);
    assert.equal(verifySchoolCertificate({ ...payload, issuedAt: "2026-06-17" }, cert), false);
    assert.equal(
      verifySchoolCertificate({ ...payload, schoolId: "00000000-0000-4000-8000-000000000000" }, cert),
      false,
    );
  });
});

describe("ProofEngine — nonce + Ed25519 (cahier protocol)", () => {
  const { publicKey, privateKey } = generateEd25519KeyPair();
  const payloadHash = hashDiplomaPayload(basePayload);
  const signature = signDiplomaHash(privateKey, payloadHash);
  const holderSecret = "holder-secret-xyz";

  const genuine = () => {
    const nonce = proofEngine.generateNonce();
    const proof = proofEngine.buildProof({ nonce, holderSecret, signatureB64: signature });
    return { nonce, proof };
  };

  it("exposes a stable engine id", () => {
    assert.equal(proofEngine.id, "ed25519-nonce-v1");
  });

  it("generates unique, URL-safe nonces", () => {
    const set = new Set(Array.from({ length: 200 }, () => proofEngine.generateNonce()));
    assert.equal(set.size, 200);
    for (const n of set) assert.match(n, /^[A-Za-z0-9_-]+$/);
  });

  it("buildProof is deterministic for identical inputs", () => {
    const nonce = proofEngine.generateNonce();
    assert.equal(
      proofEngine.buildProof({ nonce, holderSecret, signatureB64: signature }),
      proofEngine.buildProof({ nonce, holderSecret, signatureB64: signature }),
    );
  });

  it("accepts a genuine proof", () => {
    const { nonce, proof } = genuine();
    assert.equal(
      proofEngine.verifyProof({
        publicKeyPem: publicKey,
        payloadHashHex: payloadHash,
        signatureB64: signature,
        nonce,
        holderSecret,
        proof,
      }),
      true,
    );
  });

  it("rejects a forged signature (wrong issuer key)", () => {
    const { privateKey: foreign } = generateEd25519KeyPair();
    const forged = signDiplomaHash(foreign, payloadHash);
    const nonce = proofEngine.generateNonce();
    assert.equal(
      proofEngine.verifyProof({
        publicKeyPem: publicKey,
        payloadHashHex: payloadHash,
        signatureB64: forged,
        nonce,
        holderSecret,
        proof: proofEngine.buildProof({ nonce, holderSecret, signatureB64: forged }),
      }),
      false,
    );
  });

  it("rejects replay of a stale proof on a fresh nonce", () => {
    const { proof } = genuine();
    const freshNonce = proofEngine.generateNonce();
    assert.equal(
      proofEngine.verifyProof({
        publicKeyPem: publicKey,
        payloadHashHex: payloadHash,
        signatureB64: signature,
        nonce: freshNonce,
        holderSecret,
        proof,
      }),
      false,
    );
  });

  it("rejects tampered diploma content (hash no longer matches signature)", () => {
    const tampered = hashDiplomaPayload({ ...basePayload, mention: "Passable" });
    const nonce = proofEngine.generateNonce();
    assert.equal(
      proofEngine.verifyProof({
        publicKeyPem: publicKey,
        payloadHashHex: tampered,
        signatureB64: signature,
        nonce,
        holderSecret,
        proof: proofEngine.buildProof({ nonce, holderSecret, signatureB64: signature }),
      }),
      false,
    );
  });

  it("rejects a proof built with the wrong holder secret", () => {
    const nonce = proofEngine.generateNonce();
    const wrongProof = proofEngine.buildProof({ nonce, holderSecret: "attacker", signatureB64: signature });
    assert.equal(
      proofEngine.verifyProof({
        publicKeyPem: publicKey,
        payloadHashHex: payloadHash,
        signatureB64: signature,
        nonce,
        holderSecret,
        proof: wrongProof,
      }),
      false,
    );
  });
});
