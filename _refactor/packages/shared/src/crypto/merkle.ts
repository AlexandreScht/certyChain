import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "./primitives";

/**
 * RFC 6962 Merkle tree (Certificate Transparency) — the SINGLE implementation
 * shared by the SERVER (log generation, `modules/transparency`) and the
 * recruiter's BROWSER (proof verification), per v2.md piège n°6.
 *
 * Strictly RFC 6962 §2.1 — no home-grown variant (v2.md §V3-1):
 *   leaf  = SHA-256(0x00 ‖ data)          (domain separation vs nodes)
 *   node  = SHA-256(0x01 ‖ left ‖ right)
 *   MTH({}) = SHA-256(<empty string>)
 * Verification algorithms follow the RFC 9162 §2.1.3.2 / §2.1.4.2 restatement
 * of RFC 6962 §2.1.1 / §2.1.2.
 *
 * Pure and framework/serverless-free (CLAUDE.md §3): no `node:*`; SHA-256 comes
 * sync from @noble/hashes so it runs identically in Node and in a browser.
 *
 * Generation helpers (root/proof builders) THROW on malformed input — they run
 * on our own data. Verification helpers NEVER throw: any malformed, truncated
 * or inconsistent input returns `false` (they run on attacker-supplied data).
 * Hash comparisons are deliberately non-constant-time: everything here is
 * public data.
 */

const LEAF_PREFIX = Uint8Array.of(0x00);
const NODE_PREFIX = Uint8Array.of(0x01);
const HASH_BYTES = 32;

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let length = 0;
  for (const p of parts) length += p.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** SHA-256(0x00 ‖ data) — RFC 6962 §2.1 leaf hash. */
export function merkleLeafHash(leafBytes: Uint8Array): Uint8Array {
  return sha256(concatBytes(LEAF_PREFIX, leafBytes));
}

/** SHA-256(0x01 ‖ left ‖ right) — RFC 6962 §2.1 interior node hash. */
export function merkleNodeHash(left: Uint8Array, right: Uint8Array): Uint8Array {
  return sha256(concatBytes(NODE_PREFIX, left, right));
}

/* ── Internal helpers ─────────────────────────────────────────────────────── */

/** Largest power of two STRICTLY less than n (the RFC 6962 split point k), n ≥ 2. */
function splitPoint(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

/** Strict 32-byte hash from hex — throws on anything else. */
function hashFromHex(hex: string): Uint8Array {
  const bytes = hexToBytes(hex);
  if (bytes.length !== HASH_BYTES) throw new Error("merkle: hash must be 32 hex-encoded bytes");
  return bytes;
}

/** MTH over leaf HASHES on the index range [lo, hi) (hi − lo ≥ 1) — RFC 6962 §2.1. */
function subtreeRoot(hashes: readonly Uint8Array[], lo: number, hi: number): Uint8Array {
  if (hi - lo === 1) {
    const leaf = hashes[lo];
    if (!leaf) throw new Error("merkle: internal index out of range");
    return leaf;
  }
  const k = splitPoint(hi - lo);
  return merkleNodeHash(subtreeRoot(hashes, lo, lo + k), subtreeRoot(hashes, lo + k, hi));
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

const isOdd = (x: number): boolean => x % 2 === 1;
/** Right-shift by one — arithmetic, NOT `>>` (32-bit truncation on big trees). */
const half = (x: number): number => Math.floor(x / 2);

/** n ≥ 1 is an exact power of two (loop form — no 32-bit bitwise truncation). */
function isPowerOfTwo(n: number): boolean {
  let x = n;
  while (x % 2 === 0) x /= 2;
  return x === 1;
}

/* ── Generation (server side of the log; throws on bad input) ─────────────── */

/** Racine MTH depuis les hashs de feuilles (déjà préfixés 0x00), hex. */
export function merkleRootHex(leafHashesHex: readonly string[]): string {
  const hashes = leafHashesHex.map(hashFromHex);
  if (hashes.length === 0) return bytesToHex(sha256(new Uint8Array(0)));
  return bytesToHex(subtreeRoot(hashes, 0, hashes.length));
}

/** Audit path RFC 6962 §2.1.1 (PATH(m, D[n])), hex, feuille exclue, racine exclue. */
export function inclusionProofHex(leafHashesHex: readonly string[], leafIndex: number): string[] {
  const hashes = leafHashesHex.map(hashFromHex);
  const n = hashes.length;
  if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= n) {
    throw new RangeError("merkle: leafIndex out of range");
  }
  const path: string[] = [];
  // PATH(m, D[n]) = PATH(m, D[0:k]) : MTH(D[k:n])   if m <  k
  //               = PATH(m−k, D[k:n]) : MTH(D[0:k]) if m ≥ k
  const walk = (m: number, lo: number, hi: number): void => {
    if (hi - lo === 1) return;
    const k = splitPoint(hi - lo);
    if (m < k) {
      walk(m, lo, lo + k);
      path.push(bytesToHex(subtreeRoot(hashes, lo + k, hi)));
    } else {
      walk(m - k, lo + k, hi);
      path.push(bytesToHex(subtreeRoot(hashes, lo, lo + k)));
    }
  };
  walk(leafIndex, 0, n);
  return path;
}

/** Preuve de consistance RFC 6962 §2.1.2 (PROOF(m, D[n])), de fromSize vers leafHashesHex.length. */
export function consistencyProofHex(leafHashesHex: readonly string[], fromSize: number): string[] {
  const hashes = leafHashesHex.map(hashFromHex);
  const n = hashes.length;
  if (!Number.isInteger(fromSize) || fromSize < 0 || fromSize > n) {
    throw new RangeError("merkle: fromSize out of range");
  }
  // Trivial cases: the empty tree is a prefix of everything; a tree extends itself.
  if (fromSize === 0 || fromSize === n) return [];
  const proof: string[] = [];
  // SUBPROOF(m, D[m], true)  = {}
  // SUBPROOF(m, D[m], false) = {MTH(D[m])}
  // SUBPROOF(m, D[n], b)     = SUBPROOF(m, D[0:k], b) : MTH(D[k:n])       if m ≤ k
  //                          = SUBPROOF(m−k, D[k:n], false) : MTH(D[0:k]) if m > k
  const subproof = (m: number, lo: number, hi: number, complete: boolean): void => {
    if (m === hi - lo) {
      if (!complete) proof.push(bytesToHex(subtreeRoot(hashes, lo, hi)));
      return;
    }
    const k = splitPoint(hi - lo);
    if (m <= k) {
      subproof(m, lo, lo + k, complete);
      proof.push(bytesToHex(subtreeRoot(hashes, lo + k, hi)));
    } else {
      subproof(m - k, lo + k, hi, false);
      proof.push(bytesToHex(subtreeRoot(hashes, lo, lo + k)));
    }
  };
  subproof(fromSize, 0, n, true);
  return proof;
}

/* ── Verification (attacker-facing; never throws, returns false) ──────────── */

export function verifyInclusion(args: {
  leafHashHex: string;
  leafIndex: number;
  treeSize: number;
  auditPathHex: readonly string[];
  rootHashHex: string;
}): boolean {
  try {
    const { leafIndex, treeSize } = args;
    if (!Number.isInteger(treeSize) || treeSize <= 0) return false;
    if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= treeSize) return false;
    const root = hashFromHex(args.rootHashHex);
    const path = args.auditPathHex.map(hashFromHex);

    // RFC 9162 §2.1.3.2 (the iterative form of RFC 6962 §2.1.1).
    let fn = leafIndex;
    let sn = treeSize - 1;
    let r = hashFromHex(args.leafHashHex);
    for (const p of path) {
      if (sn === 0) return false; // path longer than the tree height.
      if (isOdd(fn) || fn === sn) {
        r = merkleNodeHash(p, r);
        if (!isOdd(fn)) {
          while (!isOdd(fn) && fn !== 0) {
            fn = half(fn);
            sn = half(sn);
          }
        }
      } else {
        r = merkleNodeHash(r, p);
      }
      fn = half(fn);
      sn = half(sn);
    }
    // sn ≠ 0 ⇔ the path was too short for (leafIndex, treeSize).
    return sn === 0 && equalBytes(r, root);
  } catch {
    return false;
  }
}

export function verifyConsistency(args: {
  fromSize: number;
  toSize: number;
  fromRootHex: string;
  toRootHex: string;
  proofHex: readonly string[];
}): boolean {
  try {
    const { fromSize, toSize } = args;
    if (!Number.isInteger(fromSize) || !Number.isInteger(toSize)) return false;
    if (fromSize < 0 || toSize < fromSize) return false;
    const fromRoot = hashFromHex(args.fromRootHex);
    const toRoot = hashFromHex(args.toRootHex);
    const proof = args.proofHex.map(hashFromHex);

    // Trivial cases (outside the RFC algorithm, which needs 0 < m < n).
    if (fromSize === toSize) return proof.length === 0 && equalBytes(fromRoot, toRoot);
    if (fromSize === 0) {
      // Everything is consistent with the empty tree — but the claimed old root
      // must BE the empty-tree root, and there is nothing to prove.
      return proof.length === 0 && equalBytes(fromRoot, sha256(new Uint8Array(0)));
    }
    if (proof.length === 0) return false;

    // RFC 9162 §2.1.4.2 (the iterative form of RFC 6962 §2.1.2).
    const path = isPowerOfTwo(fromSize) ? [fromRoot, ...proof] : proof;
    let fn = fromSize - 1;
    let sn = toSize - 1;
    while (isOdd(fn)) {
      fn = half(fn);
      sn = half(sn);
    }
    const seed = path[0];
    if (!seed) return false;
    let fr = seed;
    let sr = seed;
    for (const c of path.slice(1)) {
      if (sn === 0) return false; // proof longer than the tree height.
      if (isOdd(fn) || fn === sn) {
        fr = merkleNodeHash(c, fr);
        sr = merkleNodeHash(c, sr);
        if (!isOdd(fn)) {
          while (!isOdd(fn) && fn !== 0) {
            fn = half(fn);
            sn = half(sn);
          }
        }
      } else {
        sr = merkleNodeHash(sr, c);
      }
      fn = half(fn);
      sn = half(sn);
    }
    return equalBytes(fr, fromRoot) && equalBytes(sr, toRoot) && sn === 0;
  } catch {
    return false;
  }
}
