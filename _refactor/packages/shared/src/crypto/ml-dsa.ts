import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";

/**
 * ML-DSA-65 (FIPS 204, ex-CRYSTALS-Dilithium) — the post-quantum half of the
 * hybrid signature scheme (v2.md §V4-1). This is the ONE place either the
 * server or the browser calls into `@noble/post-quantum`: every other module
 * (server `crypto/keys.ts`/`crypto/signer.ts`, shared `verify-bundle.ts` /
 * `verify-transparency.ts`) goes through this thin wrapper, never the raw
 * `@noble/post-quantum` import, so the algorithm choice (ML-DSA-65, security
 * category 3 — NIST level "identity" documents) lives in exactly one file.
 *
 * `@noble/post-quantum` is 100% pure TypeScript (only depends on the equally
 * pure `@noble/hashes` / `@noble/curves` / `@noble/ciphers`) — no `node-gyp`,
 * no native binary, so this module is distroless-safe AND runs unchanged in a
 * browser, exactly like `@noble/ed25519` already does for the classical half.
 *
 * Pure and framework/server-free by contract (CLAUDE.md §3): no `node:*`, no
 * hono, no drizzle import here.
 */

/** ML-DSA-65 public key length in bytes (FIPS 204 §4, category 3 parameter set). */
export const ML_DSA_PUBLIC_KEY_BYTES = 1952;
/** ML-DSA-65 secret key length in bytes. */
export const ML_DSA_SECRET_KEY_BYTES = 4032;
/** ML-DSA-65 signature length in bytes — large enough that a proof bundle
 *  carrying it must NEVER be encoded into a QR code (v2.md §V4-2 piège n°13):
 *  the QR always encodes a URL, never the bundle itself. */
export const ML_DSA_SIGNATURE_BYTES = 3309;

// Defensive: fail loudly at import time if a future `@noble/post-quantum`
// upgrade ever changes ml_dsa65's published byte lengths — silently signing/
// verifying against the wrong assumption would be worse than a hard crash.
if (
  ml_dsa65.lengths.publicKey !== ML_DSA_PUBLIC_KEY_BYTES ||
  ml_dsa65.lengths.secretKey !== ML_DSA_SECRET_KEY_BYTES ||
  ml_dsa65.lengths.signature !== ML_DSA_SIGNATURE_BYTES
) {
  throw new Error(
    "ml-dsa.ts: @noble/post-quantum ml_dsa65 byte lengths drifted from the " +
      "constants pinned in this module — review before trusting any signature.",
  );
}

export interface MlDsaKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/** Generates a fresh ML-DSA-65 key pair. `seed` is optional (mainly for tests
 *  that need deterministic vectors); production callers always omit it. */
export function mlDsaKeygen(seed?: Uint8Array): MlDsaKeyPair {
  const { publicKey, secretKey } = ml_dsa65.keygen(seed);
  return { publicKey, secretKey };
}

/** Signs `message` with a raw ML-DSA-65 secret key. Returns raw signature bytes. */
export function mlDsaSign(secretKey: Uint8Array, message: Uint8Array): Uint8Array {
  return ml_dsa65.sign(message, secretKey);
}

/**
 * Verifies a raw ML-DSA-65 signature. Never throws (malformed input, wrong
 * lengths, etc. all fold into `false`) — this runs on attacker-supplied bundle
 * data in both the browser and the server's own verification path.
 */
export function mlDsaVerify(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean {
  try {
    return ml_dsa65.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}
