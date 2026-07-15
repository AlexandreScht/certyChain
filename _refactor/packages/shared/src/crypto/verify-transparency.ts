import { sha256 } from "@noble/hashes/sha256";
import type { ProofBundleDTO } from "@certifychain/contract/dto";
import { merkleLeafHash, verifyInclusion } from "./merkle";
import {
  b64ToBytes,
  bytesToHex,
  canonicalize,
  parseDisclosureTriple,
  pemToRawEd25519,
  utf8ToBytes,
  verifyEd25519,
} from "./primitives";

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
 * @param opts.forceNoble force the pure-JS @noble path (skip WebCrypto) — used by
 *        tests to prove the fallback works; harmless in production.
 */
export async function verifyTransparency(
  bundle: ProofBundleDTO,
  opts?: { forceNoble?: boolean },
): Promise<TransparencyOutcome> {
  const forceNoble = opts?.forceNoble ?? false;
  try {
    const t = bundle.transparency;
    if (!t) return reject("no transparency proof");
    const { checkpoint } = t;

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
