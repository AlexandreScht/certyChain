/**
 * RFC 6962 Merkle tree (v2.md §V3-7) — the shared implementation checked three
 * ways: (1) against a naive oracle transcribed literally from the RFC text,
 * (2) against frozen Certificate Transparency reference vectors, (3) by
 * inclusion/consistency properties over every tree size and leaf position.
 * Plus the server leaf builder: deterministic, RFC 6962-hashed, and PII-free.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import { verifyConsistency, verifyInclusion } from "@certifychain/shared/crypto/merkle";
import { canonicalize as sharedCanonicalize } from "@certifychain/shared/crypto/primitives";
import { canonicalize } from "../../../src/crypto/hashing";
import { buildSdV2Emission, type SdEmissionFields } from "../../../src/crypto/sd-emission";
import {
  buildIssuanceLeaf,
  consistencyProofHex,
  inclusionProofHex,
  merkleRootHex,
} from "../../../src/modules/transparency/merkle";

/* ── Naive oracle — literal transcription of RFC 6962 §2.1 ────────────────── */

function sha(...parts: Buffer[]): Buffer {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest();
}
const oracleLeaf = (data: Buffer): Buffer => sha(Buffer.from([0x00]), data);
const oracleNode = (l: Buffer, r: Buffer): Buffer => sha(Buffer.from([0x01]), l, r);

/** MTH(D[n]) — recursive, straight from the RFC text (split at k = 2^⌊log2(n−1)⌋). */
function oracleMth(leaves: readonly Buffer[]): Buffer {
  const n = leaves.length;
  if (n === 0) return sha(Buffer.alloc(0));
  if (n === 1) return oracleLeaf(leaves[0] as Buffer);
  let k = 1;
  while (k * 2 < n) k *= 2;
  return oracleNode(oracleMth(leaves.slice(0, k)), oracleMth(leaves.slice(k)));
}

/** Deterministic leaves for the property tests (65 so "n + 1" exists at n = 64). */
const LEAVES: Buffer[] = Array.from({ length: 65 }, (_, i) => Buffer.from(`leaf-${i}`, "utf8"));
const LEAF_HASHES: string[] = LEAVES.map((l) => oracleLeaf(l).toString("hex"));
const hashesUpTo = (n: number): string[] => LEAF_HASHES.slice(0, n);

/** Flip the first nibble of a hex hash — stays valid hex, changes one node. */
const flipNibble = (hex: string): string => (hex.startsWith("0") ? "f" : "0") + hex.slice(1);

/* ── Frozen vectors — the 8 historical Certificate Transparency test leaves.
 *    Cross-checked 2026-07-15 against the reference test data of
 *    transparency-dev/merkle (ex google/certificate-transparency-go) AND
 *    recomputed with the naive oracle above — both agree byte for byte. ────── */

const EMPTY_ROOT = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const CT_LEAVES: Buffer[] = [
  "",
  "00",
  "10",
  "2021",
  "3031",
  "40414243",
  "5051525354555657",
  "606162636465666768696a6b6c6d6e6f",
].map((h) => Buffer.from(h, "hex"));
const CT_LEAF_HASHES: string[] = CT_LEAVES.map((l) => oracleLeaf(l).toString("hex"));
const CT_ROOTS = [
  "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d",
  "fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125",
  "aeb6bcfe274b70a14fb067a5e5578264db0fa9b51af5e0ba159158f329e06e77",
  "d37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7",
  "4e3bbb1f7b478dcfe71fb631631519a3bca12c9aefca1612bfce4c13a86264d4",
  "76e67dadbcdf1e10e1b74ddc608abd2f98dfb16fbce75277b5232a127f2087ef",
  "ddb89be403809e325750d3d263cd78929c2942b7942a34b77e122c9594a74c8c",
  "5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328",
] as const;
const CT_PATH_0_8 = [
  "96a296d224f285c67bee93c30f8a309157f0daa35dc5b87e410b78630a09cfc7",
  "5f083f0a1a33ca076a95279832580db3e0ef4584bdff1f54c8a360f50de3031e",
  "6b47aaf29ee3c2af9af889bc1fb9254dabd31177f16232dd6aab035ca39bf6e4",
] as const;
const CT_PATH_5_8 = [
  "bc1a0643b12e4d2d7c77918f44e0f4f79a838b6cf9ec5b5c283e1f4d88599e6b",
  "ca854ea128ed050b41b35ffc1b87b8eb2bde461e9e3b5596ece6b9d5975a0ae0",
  "d37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7",
] as const;
const CT_PROOF_2_5 = [
  "5f083f0a1a33ca076a95279832580db3e0ef4584bdff1f54c8a360f50de3031e",
  "bc1a0643b12e4d2d7c77918f44e0f4f79a838b6cf9ec5b5c283e1f4d88599e6b",
] as const;
const CT_PROOF_6_8 = [
  "0ebc5d3437fbe2db158b9f126a1d118e308181031d0a949f8dededebc558ef6a",
  "ca854ea128ed050b41b35ffc1b87b8eb2bde461e9e3b5596ece6b9d5975a0ae0",
  "d37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7",
] as const;

describe("merkleRootHex — RFC 6962 §2.1 (oracle + vecteurs figés)", () => {
  it("matches the naive oracle for every tree size n ∈ [0, 64]", () => {
    for (let n = 0; n <= 64; n += 1) {
      assert.equal(
        merkleRootHex(hashesUpTo(n)),
        oracleMth(LEAVES.slice(0, n)).toString("hex"),
        `n=${n}`,
      );
    }
  });

  it("frozen: the empty tree is SHA-256 of the empty string", () => {
    assert.equal(merkleRootHex([]), EMPTY_ROOT);
  });

  it("frozen: reproduces the 8 historical Certificate Transparency roots", () => {
    for (let n = 1; n <= 8; n += 1) {
      assert.equal(merkleRootHex(CT_LEAF_HASHES.slice(0, n)), CT_ROOTS[n - 1], `CT n=${n}`);
    }
  });

  it("throws on malformed leaf hashes (bad hex, wrong length)", () => {
    assert.throws(() => merkleRootHex(["zz".repeat(32)]));
    assert.throws(() => merkleRootHex(["ab".repeat(31)]));
    assert.throws(() => merkleRootHex(["AB".repeat(32)])); // strict lowercase hex
  });
});

describe("inclusionProofHex / verifyInclusion — RFC 6962 §2.1.1", () => {
  it("frozen: reproduces the CT audit paths PATH(0, D[8]) and PATH(5, D[8])", () => {
    assert.deepEqual(inclusionProofHex(CT_LEAF_HASHES, 0), [...CT_PATH_0_8]);
    assert.deepEqual(inclusionProofHex(CT_LEAF_HASHES, 5), [...CT_PATH_5_8]);
  });

  it("property n ∈ [1,64] × i ∈ [0,n): valid proof ✓ ; tampered/truncated/extended/re-targeted ✗", () => {
    for (let n = 1; n <= 64; n += 1) {
      const hashes = hashesUpTo(n);
      const root = merkleRootHex(hashes);
      const nextRoot = merkleRootHex(hashesUpTo(n + 1));
      for (let i = 0; i < n; i += 1) {
        const path = inclusionProofHex(hashes, i);
        const ok = {
          leafHashHex: LEAF_HASHES[i] as string,
          leafIndex: i,
          treeSize: n,
          auditPathHex: path,
          rootHashHex: root,
        };
        assert.equal(verifyInclusion(ok), true, `valid n=${n} i=${i}`);
        if (path.length > 0) {
          const tampered = [...path];
          const j = Math.floor(path.length / 2);
          tampered[j] = flipNibble(tampered[j] as string);
          assert.equal(
            verifyInclusion({ ...ok, auditPathHex: tampered }),
            false,
            `tampered n=${n} i=${i}`,
          );
          assert.equal(
            verifyInclusion({ ...ok, auditPathHex: path.slice(0, -1) }),
            false,
            `truncated n=${n} i=${i}`,
          );
        }
        assert.equal(
          verifyInclusion({ ...ok, auditPathHex: [...path, ok.leafHashHex] }),
          false,
          `extended n=${n} i=${i}`,
        );
        // Re-targeted: same proof claimed against the NEXT tree (size and root move).
        assert.equal(
          verifyInclusion({ ...ok, treeSize: n + 1, rootHashHex: nextRoot }),
          false,
          `re-targeted n=${n} i=${i}`,
        );
      }
    }
  });

  it("rejects out-of-range and malformed inputs without throwing", () => {
    const hashes = hashesUpTo(4);
    const root = merkleRootHex(hashes);
    const path = inclusionProofHex(hashes, 1);
    const base = {
      leafHashHex: LEAF_HASHES[1] as string,
      leafIndex: 1,
      treeSize: 4,
      auditPathHex: path,
      rootHashHex: root,
    };
    assert.equal(verifyInclusion({ ...base, treeSize: 0 }), false);
    assert.equal(verifyInclusion({ ...base, treeSize: 4.5 }), false);
    assert.equal(verifyInclusion({ ...base, leafIndex: -1 }), false);
    assert.equal(verifyInclusion({ ...base, leafIndex: 4 }), false);
    assert.equal(verifyInclusion({ ...base, leafHashHex: "zz".repeat(32) }), false);
    assert.equal(verifyInclusion({ ...base, rootHashHex: root.slice(1) }), false); // odd length
    assert.equal(verifyInclusion({ ...base, rootHashHex: root.toUpperCase() }), false);
    assert.equal(verifyInclusion({ ...base, auditPathHex: ["ab".repeat(31), ...path.slice(1)] }), false);
    // Generation, by contrast, throws on our own bad input.
    assert.throws(() => inclusionProofHex(hashes, 4));
    assert.throws(() => inclusionProofHex(hashes, -1));
  });
});

describe("consistencyProofHex / verifyConsistency — RFC 6962 §2.1.2", () => {
  it("frozen: reproduces the CT consistency proofs PROOF(2, D[5]) and PROOF(6, D[8])", () => {
    assert.deepEqual(consistencyProofHex(CT_LEAF_HASHES.slice(0, 5), 2), [...CT_PROOF_2_5]);
    assert.deepEqual(consistencyProofHex(CT_LEAF_HASHES, 6), [...CT_PROOF_6_8]);
    assert.equal(
      verifyConsistency({
        fromSize: 2,
        toSize: 5,
        fromRootHex: CT_ROOTS[1],
        toRootHex: CT_ROOTS[4],
        proofHex: CT_PROOF_2_5,
      }),
      true,
    );
    assert.equal(
      verifyConsistency({
        fromSize: 6,
        toSize: 8,
        fromRootHex: CT_ROOTS[5],
        toRootHex: CT_ROOTS[7],
        proofHex: CT_PROOF_6_8,
      }),
      true,
    );
  });

  it("property: every pair 0 ≤ m ≤ n ≤ 16 verifies; altered root or proof fails", () => {
    for (let n = 0; n <= 16; n += 1) {
      const toRoot = merkleRootHex(hashesUpTo(n));
      for (let m = 0; m <= n; m += 1) {
        const proof = consistencyProofHex(hashesUpTo(n), m);
        const fromRoot = merkleRootHex(hashesUpTo(m));
        const ok = {
          fromSize: m,
          toSize: n,
          fromRootHex: fromRoot,
          toRootHex: toRoot,
          proofHex: proof,
        };
        assert.equal(verifyConsistency(ok), true, `valid m=${m} n=${n}`);
        assert.equal(
          verifyConsistency({ ...ok, fromRootHex: flipNibble(fromRoot) }),
          false,
          `altered from-root m=${m} n=${n}`,
        );
        if (proof.length > 0) {
          const tampered = [...proof];
          tampered[0] = flipNibble(tampered[0] as string);
          assert.equal(
            verifyConsistency({ ...ok, proofHex: tampered }),
            false,
            `altered proof m=${m} n=${n}`,
          );
        }
      }
    }
  });

  it("rejects structural nonsense without throwing", () => {
    const root5 = merkleRootHex(hashesUpTo(5));
    const root2 = merkleRootHex(hashesUpTo(2));
    // fromSize > toSize, missing proof, spurious proof on the trivial cases.
    assert.equal(
      verifyConsistency({ fromSize: 5, toSize: 2, fromRootHex: root5, toRootHex: root2, proofHex: [] }),
      false,
    );
    assert.equal(
      verifyConsistency({ fromSize: 2, toSize: 5, fromRootHex: root2, toRootHex: root5, proofHex: [] }),
      false,
    );
    assert.equal(
      verifyConsistency({
        fromSize: 5,
        toSize: 5,
        fromRootHex: root5,
        toRootHex: root5,
        proofHex: [LEAF_HASHES[0] as string],
      }),
      false,
    );
    // fromSize 0 must present the EMPTY tree root (and nothing to prove).
    assert.equal(
      verifyConsistency({ fromSize: 0, toSize: 5, fromRootHex: EMPTY_ROOT, toRootHex: root5, proofHex: [] }),
      true,
    );
    assert.equal(
      verifyConsistency({ fromSize: 0, toSize: 5, fromRootHex: root2, toRootHex: root5, proofHex: [] }),
      false,
    );
    // Generation throws out of range.
    assert.throws(() => consistencyProofHex(hashesUpTo(5), 6));
    assert.throws(() => consistencyProofHex(hashesUpTo(5), -1));
  });
});

/* ── buildIssuanceLeaf — the server-side log leaf (v2.md §V3-1) ───────────── */

const DIPLOMA_ID = "22222222-2222-4222-8222-222222222222";
const SCHOOL_ID = "11111111-1111-4111-8111-111111111111";

// Distinctive values so the substring-leak test cannot false-negative.
const FIELDS: SdEmissionFields = {
  holderName: "Zéphyrin Leakcheck",
  holderEmail: "leak.probe@example.com",
  programTitle: "MasterUltraSecretProgram",
  mention: "MentionUltraSecrete",
  rncp: "RNCP-LEAK-77",
  issuedAt: "1999-12-31",
  externalId: "EXT-LEAK-001",
};

describe("buildIssuanceLeaf — feuille du journal (v2.md §V3-1)", () => {
  const args = {
    diplomaId: DIPLOMA_ID,
    schoolId: SCHOOL_ID,
    payloadHash: "ab".repeat(32),
    signature: "c2lnbmF0dXJlLWJhc2U2NA==",
    issuedAt: "2026-07-01",
  };

  it("is deterministic and hashes per RFC 6962 (0x00 leaf prefix)", () => {
    const a = buildIssuanceLeaf(args);
    const b = buildIssuanceLeaf(args);
    assert.deepEqual(a.leafBytes, b.leafBytes);
    assert.equal(a.leafHashHex, b.leafHashHex);
    assert.equal(a.leafHashHex, oracleLeaf(a.leafBytes).toString("hex"));
  });

  it("serialized leaf carries NO PII (name/email/program) on realistic data", () => {
    const emission = buildSdV2Emission(DIPLOMA_ID, SCHOOL_ID, FIELDS);
    const { leafBytes } = buildIssuanceLeaf({
      diplomaId: DIPLOMA_ID,
      schoolId: SCHOOL_ID,
      payloadHash: emission.payloadHash,
      signature: "c2lnbmF0dXJlLWJhc2U2NA==",
      issuedAt: FIELDS.issuedAt,
    });
    const serialized = leafBytes.toString("utf8");
    assert.ok(serialized.includes(DIPLOMA_ID), "the leaf DOES commit to the diploma id");
    assert.ok(serialized.includes(emission.payloadHash), "…and to the payload hash");
    for (const pii of [FIELDS.holderName, FIELDS.holderEmail, FIELDS.programTitle]) {
      assert.ok(!serialized.includes(pii), `leaked PII value: ${pii}`);
    }
  });

  it("server canonicalize === shared canonicalize on the leaf object", () => {
    // The client verifier (verify-transparency.ts) re-derives the leaf with the
    // SHARED canonicalize: both must produce the same bytes, always.
    const leafObject = {
      signature: args.signature,
      issuedAt: args.issuedAt,
      diplomaId: args.diplomaId,
      payloadHash: args.payloadHash,
      schoolId: args.schoolId,
    };
    assert.equal(canonicalize(leafObject), sharedCanonicalize(leafObject));
    const nested = { b: [3, { z: null, a: "é" }], a: { c: 1, b: [true, false] } };
    assert.equal(canonicalize(nested), sharedCanonicalize(nested));
  });
});
