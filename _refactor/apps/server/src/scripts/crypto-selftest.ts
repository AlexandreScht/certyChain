/**
 * Live self-test of the cryptographic core (no DB required).
 * Exercises envelope encryption, the PKI root certificate chain, Ed25519 issuance,
 * and the nonce ProofEngine — including the anti-fraud rejections from the cahier.
 *
 *   pnpm --filter @certifychain/server exec tsx --env-file=../.env src/scripts/crypto-selftest.ts
 */
import assert from "node:assert/strict";
import { keyVault } from "../crypto/envelope";
import { type DiplomaPayload, hashDiplomaPayload } from "../crypto/hashing";
import {
  generateEd25519KeyPair,
  issueSchoolCertificate,
  signDiplomaHash,
  verifySchoolCertificate,
} from "../crypto/keys";
import { ed25519NonceEngine as proofEngine } from "../crypto/proof-engine";

let passed = 0;
function check(name: string, cond: boolean): void {
  assert.ok(cond, name);
  passed += 1;
  // eslint-disable-next-line no-console
  console.log(`  ✓ ${name}`);
}

// 1) Envelope encryption (secrets at rest)
const secret = "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n";
const enc = keyVault.encrypt(secret);
check("envelope: ciphertext differs from plaintext", enc !== secret);
check("envelope: decrypt roundtrip", keyVault.decryptToString(enc) === secret);
check(
  "envelope: tampered ciphertext is rejected (GCM auth)",
  (() => {
    try {
      keyVault.decrypt(`${enc.slice(0, -2)}xx`);
      return false;
    } catch {
      return true;
    }
  })(),
);

// 2) Root PKI certificate chain
const schoolId = "11111111-1111-4111-8111-111111111111";
const { publicKey, privateKey } = generateEd25519KeyPair();
const issuedAt = "2026-06-16";
const cert = issueSchoolCertificate({ schoolId, publicKey, name: "École Test", issuedAt });
check(
  "cert: valid against CertifyChain root",
  verifySchoolCertificate({ schoolId, publicKey, name: "École Test", issuedAt }, cert),
);
check(
  "cert: tampered school name is rejected",
  !verifySchoolCertificate({ schoolId, publicKey, name: "École Pirate", issuedAt }, cert),
);

// 3) Diploma issuance + nonce proof
const payload: DiplomaPayload = {
  id: "22222222-2222-4222-8222-222222222222",
  schoolId,
  holderName: "Alex Dubois",
  holderEmail: "alex@example.com",
  programTitle: "Master Data Science",
  rncp: null,
  mention: "Très Bien",
  issuedAt: "2025-07-03",
  externalId: "T-1",
};
const payloadHash = hashDiplomaPayload(payload);
const signature = signDiplomaHash(privateKey, payloadHash);
const holderSecret = "holder-secret-xyz";
const nonce = proofEngine.generateNonce();
const proof = proofEngine.buildProof({ nonce, holderSecret, signatureB64: signature });

check(
  "proof: genuine verification succeeds",
  proofEngine.verifyProof({
    publicKeyPem: publicKey,
    payloadHashHex: payloadHash,
    signatureB64: signature,
    nonce,
    holderSecret,
    proof,
  }),
);

// Forged signature (signed by a different/unknown issuer key)
const { privateKey: foreignPriv } = generateEd25519KeyPair();
const forgedSig = signDiplomaHash(foreignPriv, payloadHash);
check(
  "proof: forged signature (wrong issuer key) is rejected",
  !proofEngine.verifyProof({
    publicKeyPem: publicKey,
    payloadHashHex: payloadHash,
    signatureB64: forgedSig,
    nonce,
    holderSecret,
    proof: proofEngine.buildProof({ nonce, holderSecret, signatureB64: forgedSig }),
  }),
);

// Replay: a proof bound to one nonce must not validate against a fresh nonce
const freshNonce = proofEngine.generateNonce();
check(
  "proof: replay of a stale proof on a new nonce is rejected",
  !proofEngine.verifyProof({
    publicKeyPem: publicKey,
    payloadHashHex: payloadHash,
    signatureB64: signature,
    nonce: freshNonce,
    holderSecret,
    proof,
  }),
);

// Tampered diploma content (hash no longer matches the signature)
const tamperedHash = hashDiplomaPayload({ ...payload, mention: "Passable" });
check(
  "proof: tampered diploma content is rejected",
  !proofEngine.verifyProof({
    publicKeyPem: publicKey,
    payloadHashHex: tamperedHash,
    signatureB64: signature,
    nonce,
    holderSecret,
    proof: proofEngine.buildProof({ nonce, holderSecret, signatureB64: signature }),
  }),
);

// eslint-disable-next-line no-console
console.log(`\nAll ${passed} crypto checks passed ✓  (engine: ${proofEngine.id})`);
