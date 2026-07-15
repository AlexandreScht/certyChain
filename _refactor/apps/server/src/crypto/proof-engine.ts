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
 * Phase 2 (see v2.md): NOT a zk-SNARK. Groth16 was dropped — it buys privacy,
 * not security, and costs a trusted setup plus a circuit-bug surface. The next
 * engine is `ed25519-sd-v2`: same Ed25519 signature, but over a sorted list of
 * salted per-field digests (SD-JWT / RFC 9901), which is what actually unlocks
 * selective disclosure. Resolve the engine PER DIPLOMA (`diplomas.proof_version`)
 * — never globally, or already-issued v1 diplomas break.
 */
/** Discriminant resolved PER diploma (`diplomas.proof_version`), never globally. */
export type ProofEngineId = "ed25519-nonce-v1" | "ed25519-sd-v2";

export interface ProofEngine {
  readonly id: ProofEngineId;
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

/**
 * The legacy Phase-1 engine, unchanged. Diplomas emitted before V1 depend on it
 * for life. No longer an implicit global default: every caller resolves the
 * engine via `engineFor(diploma.proofVersion)`.
 */
export const ed25519NonceEngine: ProofEngine = new Ed25519NonceEngine();

/**
 * The `ed25519-sd-v2` engine (v2.md §V1). Selective disclosure changes only WHAT
 * is hashed and signed (the sorted list of salted digests, computed upstream);
 * the single-use nonce anti-replay transport is IDENTICAL to v1 — so it delegates
 * the nonce mechanics verbatim rather than forking them.
 */
class Ed25519SdEngine implements ProofEngine {
  readonly id = "ed25519-sd-v2";
  generateNonce(): string {
    return ed25519NonceEngine.generateNonce();
  }
  buildProof(input: { nonce: string; holderSecret: string; signatureB64: string }): string {
    return ed25519NonceEngine.buildProof(input);
  }
  verifyProof(input: {
    publicKeyPem: string;
    payloadHashHex: string;
    signatureB64: string;
    nonce: string;
    holderSecret: string;
    proof: string;
  }): boolean {
    return ed25519NonceEngine.verifyProof(input);
  }
}

export const ed25519SdEngine: ProofEngine = new Ed25519SdEngine();

/** Resolve the proof engine for a given diploma's stored `proof_version`. */
export function engineFor(proofVersion: "v1" | "v2"): ProofEngine {
  return proofVersion === "v2" ? ed25519SdEngine : ed25519NonceEngine;
}
