import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as nodeSign,
  verify as nodeVerify,
} from "node:crypto";
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
function rootPublicKeyPem(): string {
  return Buffer.from(env.CERTIFYCHAIN_ROOT_PUBLIC_KEY, "base64").toString("utf8");
}

/** The CertifyChain PKI root public key (SPKI PEM) — embedded in a v2 proof
    bundle so a recruiter can validate the school certificate chain offline. */
export function certifychainRootPublicKeyPem(): string {
  return rootPublicKeyPem();
}

/** Root-signs the binding {schoolId, publicKey} → the school's certificate (base64). */
export function issueSchoolCertificate(payload: SchoolCertPayload): string {
  return signEd25519(rootPrivateKeyPem(), Buffer.from(canonicalize(payload), "utf8"));
}

/** Verifies a school certificate against the CertifyChain root public key. */
export function verifySchoolCertificate(payload: SchoolCertPayload, certB64: string): boolean {
  return verifyEd25519(rootPublicKeyPem(), Buffer.from(canonicalize(payload), "utf8"), certB64);
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
