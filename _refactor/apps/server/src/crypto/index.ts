export { keyVault } from "./envelope";
export type { KeyVault } from "./envelope";
export { canonicalize, hashDiplomaPayload, sha256Hex } from "./hashing";
export type { DiplomaPayload } from "./hashing";
export {
  generateEd25519KeyPair,
  signEd25519,
  verifyEd25519,
  signDiplomaHash,
  issueSchoolCertificate,
  verifySchoolCertificate,
} from "./keys";
export type { Ed25519KeyPairPem, SchoolCertPayload } from "./keys";
export { proofEngine } from "./proof-engine";
export type { ProofEngine } from "./proof-engine";
