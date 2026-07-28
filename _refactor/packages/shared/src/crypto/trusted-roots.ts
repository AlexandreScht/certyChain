import { b64ToBytes, pemToRawEd25519 } from "./primitives";

/**
 * The CertifyChain PKI root(s) a verifier is willing to trust — the MANDATORY
 * anchor `verifyProofBundle` / `verifyTransparency` need to close the "root
 * pinning" gap (v2.md piège, audit 2026-07-27): both functions used to read
 * the root public key FROM THE BUNDLE ITSELF (`bundle.root.publicKey` /
 * `publicKeyPq`), which means an attacker who forges an entire self-consistent
 * bundle — including their OWN root key pair — verified "successfully" against
 * their own forged root. A proof is only as trustworthy as the anchor it is
 * checked against; that anchor can never come from the artifact being checked.
 *
 * This type is deliberately NOT read from `process.env` here — `packages/shared`
 * stays 100% framework/runtime-free (CLAUDE.md §3). Every caller supplies its
 * own trusted roots explicitly:
 *   - the SERVER knows the real root via `apps/server/src/config/env.ts`
 *     (`CERTIFYCHAIN_ROOT_PUBLIC_KEY` / `CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY`);
 *   - the BROWSER gets it baked in at BUILD time via `NEXT_PUBLIC_*` (see
 *     `apps/client/web/src/lib/trusted-roots.ts`) — inlined by Next.js at
 *     compile time, which is what makes it an actual trust anchor instead of a
 *     value the very server we don't trust yet could hand us at runtime.
 */
export interface TrustedRoots {
  /**
   * Accepted Ed25519 root public keys, SPKI PEM. Comparison happens on the
   * DECODED bytes (`pemToRawEd25519`), never the raw string — PEM headers,
   * whitespace and CRLF vary without changing the key. MUST be non-empty:
   * both `verifyProofBundle` and `verifyTransparency` treat an empty list as
   * "trust nothing" and reject every bundle, never as "fall back to
   * whatever root the bundle carries" (exactly the bypass this type exists
   * to close).
   *
   * A LIST, not a single key, on purpose: root rotation (v2.md P2, planned)
   * means keeping the outgoing root alongside the incoming one during the
   * switch-over window so bundles signed under either still verify.
   */
  ed25519: readonly string[];
  /**
   * Accepted ML-DSA-65 root public keys, raw bytes base64 (v2.md §V4-1) — no
   * PEM/SPKI convention exists for ML-DSA. Comparison happens on the decoded
   * bytes, same rationale as `ed25519`. May legitimately be an empty array
   * when post-quantum has never been deployed: no `sd-v3` bundle can then
   * ever verify (there is no PQ root to trust) — that is correct fail-closed
   * behaviour, not a special case a caller needs to work around.
   */
  mlDsa65: readonly string[];
}

/** Constant-time-ish comparison (no early exit on length-equal buffers) — these
 *  are PUBLIC keys, not secrets, so timing leaks are not the concern here; this
 *  just avoids `Buffer`-only helpers that would break outside Node. */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

/**
 * True when `pem`'s DECODED Ed25519 bytes match one of `roots` — any PEM
 * whitespace/header variant of the SAME key compares equal, per contract.
 */
export function isTrustedEd25519Root(pem: string, roots: readonly string[]): boolean {
  let candidate: Uint8Array;
  try {
    candidate = pemToRawEd25519(pem);
  } catch {
    return false;
  }
  return roots.some((r) => {
    try {
      return bytesEqual(pemToRawEd25519(r), candidate);
    } catch {
      return false;
    }
  });
}

/**
 * True when `b64`'s DECODED bytes match one of `roots` (base64 raw ML-DSA-65
 * public key bytes — there is no PEM equivalent to normalize here, but the
 * comparison still happens on decoded bytes for symmetry with `ed25519` and
 * to tolerate incidental base64 padding differences).
 */
export function isTrustedMlDsaRoot(b64: string, roots: readonly string[]): boolean {
  let candidate: Uint8Array;
  try {
    candidate = b64ToBytes(b64);
  } catch {
    return false;
  }
  return roots.some((r) => {
    try {
      return bytesEqual(b64ToBytes(r), candidate);
    } catch {
      return false;
    }
  });
}
