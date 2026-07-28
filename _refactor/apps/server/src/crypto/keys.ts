import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as nodeSign,
  verify as nodeVerify,
} from "node:crypto";
import { mlDsaSign } from "@certifychain/shared/crypto/ml-dsa";
import { env } from "../config/env";
import { canonicalize } from "./hashing";

/* ── Ed25519 key pairs (per-school issuer keys + the PKI root) ───────────── */

export interface Ed25519KeyPairPem {
  publicKey: string; // SPKI PEM
  privateKey: string; // PKCS8 PEM
}

export function generateEd25519KeyPair(): Ed25519KeyPairPem {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

export function signEd25519(privateKeyPem: string, data: Buffer): string {
  return nodeSign(null, data, createPrivateKey(privateKeyPem)).toString("base64");
}

export function verifyEd25519(publicKeyPem: string, data: Buffer, signatureB64: string): boolean {
  try {
    return nodeVerify(null, data, createPublicKey(publicKeyPem), Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

/** Sign a diploma's hex hash (the bytes, not the hex string). */
export function signDiplomaHash(privateKeyPem: string, payloadHashHex: string): string {
  return signEd25519(privateKeyPem, Buffer.from(payloadHashHex, "hex"));
}

/* ── Root PKI: CertifyChain signs each school's certificate ──────────────── */

export interface SchoolCertPayload {
  schoolId: string;
  publicKey: string;
  name: string;
  issuedAt: string;
}

function rootPrivateKeyPem(): string {
  return Buffer.from(env.CERTIFYCHAIN_ROOT_PRIVATE_KEY, "base64").toString("utf8");
}

/**
 * Every Ed25519 PKI root public key (SPKI PEM) THIS SERVER currently trusts,
 * decoded, in `.env` CSV order (`config/env.ts#certifychainRootPublicKeys` —
 * root rotation, docs/security/root-secrets-rotation.md §4). A school
 * certificate signed by ANY of these must keep verifying: an outgoing root
 * stays in this list, alongside the incoming one, for as long as a
 * certificate it signed remains in use (potentially indefinitely — CLAUDE.md
 * §1, "la preuve est autonome").
 */
export function certifychainTrustedEd25519Roots(): string[] {
  return env.certifychainRootPublicKeys.map((b64) => Buffer.from(b64, "base64").toString("utf8"));
}

/**
 * The CURRENT signing root's public key (SPKI PEM) — by convention the FIRST
 * entry of the trusted list, the one `CERTIFYCHAIN_ROOT_PRIVATE_KEY` actually
 * signs with (rotation doc §4 step 4). Embedded in FRESH v2/v3 proof bundles
 * as `root.publicKey` so a recruiter can validate the school certificate
 * chain offline — but ONLY correct for a school certified under THIS
 * convention key. A school certified under an older, still-trusted root must
 * instead use whatever `findTrustedEd25519RootFor` returns for ITS
 * certificate — never assume "current" for an arbitrary school.
 */
export function certifychainRootPublicKeyPem(): string {
  const [pem] = certifychainTrustedEd25519Roots();
  if (pem === undefined) {
    // Unreachable in practice: `config/env.ts` superRefine fails the boot
    // before this can ever run empty — but never silently trust "no root".
    throw new Error("CERTIFYCHAIN_ROOT_PUBLIC_KEY resolved to an empty trusted root list");
  }
  return pem;
}

/** Root-signs the binding {schoolId, publicKey} → the school's certificate
 *  (base64). Always signs with the CURRENT private key — there is exactly
 *  one active signing key at any time (rotation doc §4: "on ne signe qu'avec
 *  la racine courante"); only VERIFICATION accepts several. */
export function issueSchoolCertificate(payload: SchoolCertPayload): string {
  return signEd25519(rootPrivateKeyPem(), Buffer.from(canonicalize(payload), "utf8"));
}

/**
 * Finds, among EVERY currently-trusted Ed25519 root (the current signing key
 * plus any still-coexisting outgoing one), the specific public key whose
 * signature validates `certB64` for `payload` — or `null` if none does.
 *
 * A school approved BEFORE a root rotation was certified under the OLD root:
 * checking only the current signing key would wrongly reject it (that is
 * exactly the gap this function closes — docs/security/root-secrets-
 * rotation.md §4 step 5 keeps the old public key pinned precisely so this
 * keeps working). Returning the MATCHING key — not just "current" — is also
 * what lets a freshly-built v2/v3 bundle embed the root that actually chains
 * for THIS school, rather than an unrelated one that happens to be first.
 */
export function findTrustedEd25519RootFor(payload: SchoolCertPayload, certB64: string): string | null {
  const message = Buffer.from(canonicalize(payload), "utf8");
  for (const pem of certifychainTrustedEd25519Roots()) {
    if (verifyEd25519(pem, message, certB64)) return pem;
  }
  return null;
}

/** Verifies a school certificate against ANY currently-trusted CertifyChain
 *  root (current signing key or a coexisting outgoing one) — see
 *  `findTrustedEd25519RootFor`. */
export function verifySchoolCertificate(payload: SchoolCertPayload, certB64: string): boolean {
  return findTrustedEd25519RootFor(payload, certB64) !== null;
}

/* ── Transparency log: root-signed checkpoints (STH) ─────────────────────── */

export interface LogCheckpointPayload {
  treeSize: number;
  rootHash: string;
  timestamp: string;
}

/**
 * Root-signs a transparency-log checkpoint (v2.md §V3-1) — the EXACT mirror of
 * `issueSchoolCertificate`: `signEd25519(rootPriv, utf8(canonicalize(payload)))`.
 * The shared browser verifier (`verify-transparency.ts`) recomputes this same
 * canonical form over `{treeSize, rootHash, timestamp}`, so the two must never
 * drift — same root key, same canonicalize.
 */
export function signLogCheckpoint(payload: LogCheckpointPayload): string {
  return signEd25519(rootPrivateKeyPem(), Buffer.from(canonicalize(payload), "utf8"));
}

/* ── V4 — post-quantum root signatures (v2.md §V4-1, hybrid "AND") ────────────
 *
 * The CertifyChain PKI root ALSO holds an ML-DSA-65 key pair
 * (`CERTIFYCHAIN_ROOT_PQ_{PRIVATE,PUBLIC}_KEY`, raw bytes base64 — ML-DSA has
 * no PEM/SPKI convention like Ed25519). Its mandatory scope (v2.md §V4-1) is
 * diplomas AND school certificates AND transparency-log checkpoints: a chain
 * is never stronger than its weakest classical link, so every place the root
 * (or a school) signs in Ed25519 gets a mirrored ML-DSA-65 signature over the
 * SAME message. Verification of these signatures lives ONLY in
 * `packages/shared` (verify-bundle.ts / verify-transparency.ts) — this file
 * only signs; the "single implementation of verification" rule (v2.md §6
 * piège n°6) would otherwise be broken by a second, server-side verifier. */

function rootPqPrivateKeyBytes(): Buffer {
  return Buffer.from(env.CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY, "base64");
}

/**
 * Every ML-DSA-65 PKI root public key (base64 raw bytes) THIS SERVER
 * currently trusts, in `.env` CSV order (`config/env.ts#
 * certifychainRootPqPublicKeys` — same root rotation convention as
 * `certifychainTrustedEd25519Roots`). Empty when PQ has never been
 * deployed (`PQ_POLICY=off`), matching the historical "" default.
 *
 * ⚠️ Unlike the Ed25519 side, this module does NOT expose a
 * `findTrustedMlDsaRootFor` — PQ signature *verification* lives exclusively
 * in `packages/shared` (verify-bundle.ts / verify-transparency.ts, v2.md §6
 * piège n°6: a second server-side implementation would defeat the whole
 * point of "one implementation, no divergence"). Multi-root PQ matching for
 * an ML-DSA-65 school certificate signed under a rotated-out root is
 * therefore not yet resolved server-side beyond the CSV list itself being
 * correctly wired into `SERVER_TRUSTED_ROOTS` — see the note in
 * `modules/verify/verify.routes.ts`.
 */
export function certifychainTrustedMlDsaRoots(): string[] {
  return env.certifychainRootPqPublicKeys;
}

/** The CURRENT signing PQ root's public key (base64 raw bytes) — by
 *  convention the FIRST entry of the trusted list, embedded in fresh v3
 *  bundles as `root.publicKeyPq`. Empty string when PQ is disabled/
 *  unconfigured (`certifychainTrustedMlDsaRoots()` then empty) — identical
 *  to the historical single-value default, non-regression. */
export function certifychainRootPqPublicKeyB64(): string {
  return certifychainTrustedMlDsaRoots()[0] ?? "";
}

/**
 * Root-signs the SAME canonical shape as {@link issueSchoolCertificate}, in
 * ML-DSA-65 — but with `payload.publicKey` set to the school's ML-DSA public
 * key (base64), never its Ed25519 one. This is what "same canonical payload,
 * two signatures" means here: same message TYPE, same `canonicalize`, the
 * actual `publicKey` bytes plugged in differ because they certify a DIFFERENT
 * key of the SAME school. Without this, the school's PQ key would float
 * unbound to its identity — anyone could substitute their own.
 */
export function issueSchoolCertificatePq(payload: SchoolCertPayload): string {
  const sig = mlDsaSign(rootPqPrivateKeyBytes(), Buffer.from(canonicalize(payload), "utf8"));
  return Buffer.from(sig).toString("base64");
}

/**
 * Root-signs a transparency-log checkpoint in ML-DSA-65 — the EXACT mirror of
 * {@link signLogCheckpoint}: same `{treeSize, rootHash, timestamp}` message,
 * same `canonicalize`, only the algorithm/key differ. Called only once
 * `PQ_POLICY !== "off"` (`env.pqEnabled`); a checkpoint signed before that has
 * no post-quantum signature and keeps verifying Ed25519-only, forever.
 */
export function signLogCheckpointPq(payload: LogCheckpointPayload): string {
  const sig = mlDsaSign(rootPqPrivateKeyBytes(), Buffer.from(canonicalize(payload), "utf8"));
  return Buffer.from(sig).toString("base64");
}
