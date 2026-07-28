export { keyVault } from "./envelope";
export type { KeyVault } from "./envelope";
export { canonicalize, hashDiplomaPayload, hashSdPayloadV2, hashSdPayloadV3, sha256Hex } from "./hashing";
export type { DiplomaPayload, SdPayloadV2, SdPayloadV3 } from "./hashing";
export { makeSalt, makeDisclosure, digestOf, parseDisclosure, decodeBase64Url } from "./disclosures";
export type { Disclosure } from "./disclosures";
export { buildSdV2Emission, buildSdV3Emission } from "./sd-emission";
export type { SdEmission, SdEmissionFields, SdV3Emission } from "./sd-emission";
export {
  generateEd25519KeyPair,
  signEd25519,
  verifyEd25519,
  signDiplomaHash,
  issueSchoolCertificate,
  verifySchoolCertificate,
  findTrustedEd25519RootFor,
  certifychainRootPublicKeyPem,
  certifychainTrustedEd25519Roots,
  signLogCheckpoint,
  certifychainRootPqPublicKeyB64,
  certifychainTrustedMlDsaRoots,
  issueSchoolCertificatePq,
  signLogCheckpointPq,
} from "./keys";
export type { Ed25519KeyPairPem, SchoolCertPayload, LogCheckpointPayload } from "./keys";
export { ed25519NonceEngine, ed25519SdEngine, ed25519SdV3Engine, engineFor } from "./proof-engine";
export type { ProofEngine, ProofEngineId } from "./proof-engine";
export {
  envelopeSigner,
  envelopePqSigner,
  KmsSigner,
  signerFor,
  resolveSchoolSigner,
  rawEd25519PublicKeyToSpkiPem,
} from "./signer";
export type { Signer, SignerKind, KmsSignerOptions, PqSigner } from "./signer";
