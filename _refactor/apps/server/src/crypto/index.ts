export { keyVault } from "./envelope";
export type { KeyVault } from "./envelope";
export { canonicalize, hashDiplomaPayload, hashSdPayloadV2, sha256Hex } from "./hashing";
export type { DiplomaPayload, SdPayloadV2 } from "./hashing";
export { makeSalt, makeDisclosure, digestOf, parseDisclosure, decodeBase64Url } from "./disclosures";
export type { Disclosure } from "./disclosures";
export { buildSdV2Emission } from "./sd-emission";
export type { SdEmission, SdEmissionFields } from "./sd-emission";
export {
  generateEd25519KeyPair,
  signEd25519,
  verifyEd25519,
  signDiplomaHash,
  issueSchoolCertificate,
  verifySchoolCertificate,
  certifychainRootPublicKeyPem,
  signLogCheckpoint,
} from "./keys";
export type { Ed25519KeyPairPem, SchoolCertPayload, LogCheckpointPayload } from "./keys";
export { ed25519NonceEngine, ed25519SdEngine, engineFor } from "./proof-engine";
export type { ProofEngine, ProofEngineId } from "./proof-engine";
export {
  envelopeSigner,
  KmsSigner,
  signerFor,
  resolveSchoolSigner,
  rawEd25519PublicKeyToSpkiPem,
} from "./signer";
export type { Signer, SignerKind, KmsSignerOptions } from "./signer";
