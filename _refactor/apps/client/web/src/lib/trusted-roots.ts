import type { TrustedRoots } from "@certifychain/shared/crypto/verify-bundle";

/**
 * The CertifyChain PKI root(s) THIS BROWSER trusts (audit 2026-07-27 root-
 * pinning fix — see `packages/shared/src/crypto/trusted-roots.ts`). Baked in
 * at BUILD time via `NEXT_PUBLIC_*`: Next.js inlines these into the client
 * bundle, which is what makes them an actual trust anchor — a value fetched
 * from the API at runtime would be worthless here, because the API is
 * PRECISELY the thing a forged bundle is trying to impersonate offline on
 * `/verifier` (CLAUDE.md §1: "la preuve est autonome").
 *
 * Format mirrors the SERVER's own env vars exactly, so an operator can copy
 * the same values across without re-deriving anything:
 *   - `NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PUBLIC_KEY`: comma-separated list of
 *     base64-encoded Ed25519 SPKI PEM — same encoding as the server's
 *     `CERTIFYCHAIN_ROOT_PUBLIC_KEY` (`.env`, ALSO a CSV since the 2026-07-28
 *     audit — `config/env.ts#certifychainRootPublicKeys`). A CSV, not a
 *     single value, to support root rotation
 *     (docs/security/root-secrets-rotation.md §4): list the outgoing root
 *     alongside the incoming one during the switch-over window.
 *   - `NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY`: comma-separated list of
 *     base64 raw ML-DSA-65 public keys — same encoding as the server's
 *     `CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY`.
 *
 * ── Degradation when unset at build time ───────────────────────────────────
 * Both reads are then `undefined` → both lists end up EMPTY. `packages/shared`
 * treats an empty `ed25519` list as "trust nothing" and rejects every bundle
 * with an explicit "no trusted CertifyChain root configured" reason — NEVER a
 * silent fall-back to trusting the bundle's own declared root (that fallback
 * IS the vulnerability this module exists to close). This is a deliberate
 * choice over failing the Docker build outright: it keeps `next build`
 * available for local iteration without secrets configured (consistent with
 * how every other optional integration in this repo degrades — INSEE/Gemini/
 * ProConnect/Stripe), while still making a misconfiguration immediately and
 * loudly visible in the UI/QA (every proof shows "invalid") instead of
 * invisibly insecure.
 *
 * ⚠️ Operational consequence: rotating the CertifyChain root key REQUIRES a
 * REBUILD of all three Next.js front images, not just a redeploy/restart —
 * `NEXT_PUBLIC_*` values are frozen into the JS bundle at compile time. See
 * `.env.example` and `docs/architecture/decisions/0007-browser-root-pinning.md`.
 */

function splitCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Decodes a CSV of base64-encoded PEM blobs, skipping (and logging) any
 *  malformed entry rather than letting one bad value blank the whole list —
 *  a typo in an INCOMING rotation root should not also break verification
 *  against the still-valid OUTGOING one. */
function decodeBase64PemList(values: string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    try {
      out.push(atob(value));
    } catch {
      console.error(
        "NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PUBLIC_KEY: skipping a malformed base64 entry",
      );
    }
  }
  return out;
}

export const TRUSTED_ROOTS: TrustedRoots = {
  ed25519: decodeBase64PemList(splitCsv(process.env.NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PUBLIC_KEY)),
  mlDsa65: splitCsv(process.env.NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY),
};
