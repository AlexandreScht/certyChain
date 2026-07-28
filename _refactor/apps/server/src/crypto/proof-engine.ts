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
export type ProofEngineId = "ed25519-nonce-v1" | "ed25519-sd-v2" | "ed25519-sd-v3";

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
 * Les moteurs de divulgation sélective (`ed25519-sd-v2`, v2.md §V1 — et son
 * extension hybride `ed25519-sd-v3`, §V4-1). La divulgation sélective ne change
 * que CE QUI est haché et signé (la liste triée de hachés salés, calculée en
 * amont) ; le transport anti-rejeu à nonce à usage unique est IDENTIQUE à v1 —
 * d'où la délégation verbatim des mécaniques de nonce plutôt qu'un fork.
 *
 * Une seule classe, deux instances qui ne diffèrent QUE par leur `id` : v3
 * partage exactement le même transport que v2 (l'ajout d'une signature ML-DSA-65
 * se joue au niveau du bundle, dont ce moteur n'a aucune part). Mais l'`id` est
 * la version de preuve RAPPORTÉE — dans la réponse `/verify` et, surtout, dans
 * la métadonnée d'audit durable. Le faire mentir (« v2 » pour une preuve
 * hybride) sous-déclarerait à vie la nature des preuves émises, d'autant que
 * `PQ_POLICY=require` fait de v3 le cas nominal.
 */
class Ed25519SdEngine implements ProofEngine {
  constructor(readonly id: ProofEngineId) {}
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

export const ed25519SdEngine: ProofEngine = new Ed25519SdEngine("ed25519-sd-v2");

/**
 * Le moteur `ed25519-sd-v3` (v2.md §V4-1, hybride post-quantique). Mécanique de
 * nonce strictement identique à `ed25519SdEngine` — seul l'identifiant rapporté
 * diffère, pour que `VerificationResultDTO.engine` et l'audit correspondent au
 * `engine` réellement porté par le bundle (`ed25519-sd-v3`).
 */
export const ed25519SdV3Engine: ProofEngine = new Ed25519SdEngine("ed25519-sd-v3");

/**
 * Resolve the proof engine for a given diploma's stored `proof_version`.
 * Un moteur PAR version : les diplômes v1 et v2 déjà émis passent par exactement
 * le même objet qu'avant (aucune bascule globale), et v3 obtient son propre
 * identifiant afin que ce qui est rapporté (réponse HTTP + trace d'audit) ne
 * mente pas sur la version réelle de la preuve.
 */
export function engineFor(proofVersion: "v1" | "v2" | "v3"): ProofEngine {
  if (proofVersion === "v1") return ed25519NonceEngine;
  return proofVersion === "v3" ? ed25519SdV3Engine : ed25519SdEngine;
}
