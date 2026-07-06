import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { verifyEd25519 } from "./keys";

/**
 * ProofEngine — the swappable verification core.
 *
 * Phase 1 (`ed25519-nonce-v1`, here): authenticity comes from the school's
 * Ed25519 signature over the diploma hash; a single-use nonce binds each
 * verification so a captured link cannot be replayed. The document content is
 * never disclosed.
 *
 * Phase 2: drop in a real zk-SNARK (SnarkJS/Circom Groth16) implementing this
 * same interface — callers (the verify module) stay unchanged.
 */
export interface ProofEngine {
  readonly id: string;
  generateNonce(): string;
  buildProof(input: { nonce: string; holderSecret: string; signatureB64: string }): string;
  verifyProof(input: {
    publicKeyPem: string;
    payloadHashHex: string;
    signatureB64: string;
    nonce: string;
    holderSecret: string;
    proof: string;
  }): boolean;
}

class Ed25519NonceEngine implements ProofEngine {
  readonly id = "ed25519-nonce-v1";

  generateNonce(): string {
    return randomBytes(32).toString("base64url");
  }

  buildProof({
    nonce,
    holderSecret,
    signatureB64,
  }: {
    nonce: string;
    holderSecret: string;
    signatureB64: string;
  }): string {
    return createHash("sha256")
      .update(`${nonce}.${holderSecret}.${signatureB64}`, "utf8")
      .digest("base64url");
  }

  verifyProof(input: {
    publicKeyPem: string;
    payloadHashHex: string;
    signatureB64: string;
    nonce: string;
    holderSecret: string;
    proof: string;
  }): boolean {
    // (a) Authenticity — the issuer's Ed25519 signature over the diploma hash.
    const authentic = verifyEd25519(
      input.publicKeyPem,
      Buffer.from(input.payloadHashHex, "hex"),
      input.signatureB64,
    );
    if (!authentic) return false;

    // (b) Binding / anti-replay — the proof must bind exactly this nonce.
    const expected = this.buildProof({
      nonce: input.nonce,
      holderSecret: input.holderSecret,
      signatureB64: input.signatureB64,
    });
    const a = Buffer.from(input.proof);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

export const proofEngine: ProofEngine = new Ed25519NonceEngine();
