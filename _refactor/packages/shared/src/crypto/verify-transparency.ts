import { sha256 } from "@noble/hashes/sha256";
import type { ProofBundleDTO } from "@certifychain/contract/dto";
import { merkleLeafHash, verifyInclusion } from "./merkle";
import { mlDsaVerify } from "./ml-dsa";
import {
  b64ToBytes,
  bytesToHex,
  canonicalize,
  parseDisclosureTriple,
  pemToRawEd25519,
  utf8ToBytes,
  verifyEd25519,
} from "./primitives";
import { isTrustedEd25519Root, isTrustedMlDsaRoot, type TrustedRoots } from "./trusted-roots";

/**
 * `verifyTransparency` — the SINGLE implementation of the transparency-log
 * check on a proof bundle (v2.md §V3-4), used verbatim by the SERVER AND by
 * the recruiter's BROWSER (piège n°6: one implementation, no divergence). It
 * lets a verifier assert, WITHOUT trusting CertifyChain: "this diploma sits at
 * position N of the public issuance log, in a tree whose signed root is
 * timestamped …".
 *
 * Pure and framework/serverless-free by contract (CLAUDE.md §3): NO `node:*`,
 * hono or drizzle imports. It says NOTHING about the signature/PKI/disclosure
 * validity of the bundle itself — that is `verifyProofBundle`'s job; run both.
 *
 * ── Root pinning (audit 2026-07-27) ────────────────────────────────────────
 * The checkpoint (STH) is verified against `bundle.root.publicKey` — data
 * carried by the bundle itself. Exactly like `verifyProofBundle`, this
 * function takes a MANDATORY `trustedRoots` argument and rejects, BEFORE
 * checking the checkpoint signature, when that root is not one of the pinned
 * ones. Same reason, same failure mode, same "no divergence" rule (piège n°6):
 * a forged checkpoint signed by an attacker's own root must never verify just
 * because the bundle also carries that attacker's root key.
 *
 * Leaf ↔ diploma binding: the server leaf commits to
 * `{diplomaId, schoolId, payloadHash, signature, issuedAt}` (no PII — the log
 * is public). Everything but `issuedAt` is recomputable from the bundle, so:
 *   • `issuedAt` disclosed  → recompute the full leaf, byte for byte ("full");
 *   • `issuedAt` hidden     → NEVER guess or expose a masked value — the proof
 *     still pins `leafHash` into the signed tree, but the leaf ↔ diploma link
 *     is not re-derived locally ("hash-only").
 */

export type TransparencyOutcome =
  | {
      ok: true;
      binding: "full" | "hash-only";
      leafIndex: number;
      treeSize: number;
      checkpointTimestamp: string;
      otsUpgradedAt: string | null;
    }
  | { ok: false; reason: string };

function reject(reason: string): TransparencyOutcome {
  return { ok: false, reason };
}

/**
 * @param trustedRoots the ONLY CertifyChain PKI root(s) this call trusts — see
 *        the module doc above and `verifyProofBundle`'s. MANDATORY, and its
 *        `ed25519` list MUST be non-empty or verification refuses everything.
 * @param opts.forceNoble force the pure-JS @noble path (skip WebCrypto) — used by
 *        tests to prove the fallback works; harmless in production.
 */
export async function verifyTransparency(
  bundle: ProofBundleDTO,
  trustedRoots: TrustedRoots,
  opts?: { forceNoble?: boolean },
): Promise<TransparencyOutcome> {
  const forceNoble = opts?.forceNoble ?? false;
  try {
    const t = bundle.transparency;
    if (!t) return reject("no transparency proof");
    const { checkpoint } = t;

    // 0 — root pinning, BEFORE the checkpoint signature is checked. Same rule
    // and same reason as `verifyProofBundle`: `bundle.root.publicKey` is data
    // under attacker control, never a trust anchor on its own.
    if (trustedRoots.ed25519.length === 0) {
      return reject("no trusted CertifyChain root configured — refusing to verify");
    }
    if (!isTrustedEd25519Root(bundle.root.publicKey, trustedRoots.ed25519)) {
      return reject("this proof was not issued by CertifyChain (unknown PKI root)");
    }

    // 1 — the checkpoint (STH) must be signed by the CertifyChain root. The
    //     canonical form mirrors the server checkpoint signer exactly (same
    //     shape as `issueSchoolCertificate` in crypto/keys.ts).
    const rootPub = pemToRawEd25519(bundle.root.publicKey);
    const checkpointMessage = utf8ToBytes(
      canonicalize({
        treeSize: checkpoint.treeSize,
        rootHash: checkpoint.rootHash,
        timestamp: checkpoint.timestamp,
      }),
    );
    if (
      !(await verifyEd25519(rootPub, checkpointMessage, b64ToBytes(checkpoint.signature), forceNoble))
    ) {
      return reject("invalid checkpoint signature");
    }

    // 1-PQ — hybrid "AND" (v2.md §V4-1): a checkpoint signed under `PQ_POLICY`
    // ALSO carries an ML-DSA-65 root signature over the SAME message. Deduced
    // from the checkpoint itself (`signaturePq` present), never from a policy
    // flag: a checkpoint predating the PQ rollout has no `signaturePq` and
    // keeps verifying Ed25519-only, exactly as before (non-regression).
    if (checkpoint.signaturePq) {
      if (!bundle.root.publicKeyPq) {
        return reject("checkpoint carries a post-quantum signature but the bundle has no PQ root key");
      }
      if (!isTrustedMlDsaRoot(bundle.root.publicKeyPq, trustedRoots.mlDsa65)) {
        return reject("this proof was not issued by CertifyChain (unknown post-quantum PKI root)");
      }
      const rootPubPq = b64ToBytes(bundle.root.publicKeyPq);
      if (!mlDsaVerify(rootPubPq, checkpointMessage, b64ToBytes(checkpoint.signaturePq))) {
        return reject("invalid post-quantum checkpoint signature");
      }
    }

    // 2 — the leaf must be included in the checkpointed tree (RFC 6962).
    if (
      !verifyInclusion({
        leafHashHex: t.leafHash,
        leafIndex: t.leafIndex,
        treeSize: checkpoint.treeSize,
        auditPathHex: t.auditPath,
        rootHashHex: checkpoint.rootHash,
      })
    ) {
      return reject("leaf is not included in the checkpointed tree");
    }

    // 3 — bind the leaf to THIS diploma (see module doc). `issuedAt` comes from
    //     the disclosures, parsed exactly like verify-bundle does.
    let issuedAt: unknown;
    let issuedAtDisclosed = false;
    for (const d of bundle.disclosures) {
      const [, name, value] = parseDisclosureTriple(d);
      if (name === "issuedAt") {
        issuedAt = value;
        issuedAtDisclosed = true;
      }
    }
    let binding: "full" | "hash-only" = "hash-only";
    if (issuedAtDisclosed) {
      const payloadHash = bytesToHex(sha256(utf8ToBytes(canonicalize(bundle.payload))));
      const leafBytes = utf8ToBytes(
        canonicalize({
          diplomaId: bundle.payload.id,
          schoolId: bundle.payload.schoolId,
          payloadHash,
          signature: bundle.signature,
          issuedAt,
        }),
      );
      if (bytesToHex(merkleLeafHash(leafBytes)) !== t.leafHash) {
        return reject("leaf does not match this diploma");
      }
      binding = "full";
    }

    return {
      ok: true,
      binding,
      leafIndex: t.leafIndex,
      treeSize: checkpoint.treeSize,
      checkpointTimestamp: checkpoint.timestamp,
      otsUpgradedAt: checkpoint.otsUpgradedAt ?? null,
    };
  } catch (e) {
    return reject(e instanceof Error ? e.message : "verification error");
  }
}
