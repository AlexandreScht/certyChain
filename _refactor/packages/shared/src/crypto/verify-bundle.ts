import { sha256 } from "@noble/hashes/sha256";
import type { ProofBundleDTO } from "@certifychain/contract/dto";
import {
  asciiToBytes,
  b64ToBytes,
  bytesToB64url,
  canonicalize,
  parseDisclosureTriple,
  pemToRawEd25519,
  utf8ToBytes,
  verifyEd25519,
} from "./primitives";

/**
 * `verifyProofBundle` — the SINGLE implementation of the ed25519-sd-v2
 * verification algorithm (v2.md §V1-2), used verbatim by the SERVER (its own
 * verdict) AND by the recruiter's BROWSER. One implementation ⇒ no server/client
 * divergence (the exact design bug of legacy audit #9).
 *
 * Pure and framework/serverless-free by contract (CLAUDE.md §3): NO `node:*`,
 * hono or drizzle imports — it runs unchanged in a browser and in Node. Ed25519
 * uses WebCrypto when `crypto.subtle` exposes it, else the pure-JS `@noble`
 * fallback (both paths are exercised in tests; the fallback is forceable).
 * Encoding/canonicalization/Ed25519 helpers live in `./primitives` (shared with
 * `verify-transparency.ts`).
 *
 * It verifies authenticity + PKI chain + disclosure integrity. It deliberately
 * says NOTHING about revocation: that is a fact posterior to signing and needs a
 * network call (`bundle.revocation`). Never show "Verified" on crypto alone.
 */

export type VerifyOutcome =
  | { ok: true; disclosed: Record<string, unknown>; hidden: number }
  | { ok: false; reason: string };

/** digest = base64url(SHA-256(<ASCII chars of the disclosure>)) — RFC 9901 §4.2.4. */
function digestOfDisclosure(d: string): string {
  return bytesToB64url(sha256(asciiToBytes(d)));
}

/* ── The 7-step algorithm (v2.md §V1-2) ───────────────────────────────────── */

function reject(reason: string): VerifyOutcome {
  return { ok: false, reason };
}

/**
 * @param opts.forceNoble force the pure-JS @noble path (skip WebCrypto) — used by
 *        tests to prove the fallback works; harmless in production.
 */
export async function verifyProofBundle(
  bundle: ProofBundleDTO,
  opts?: { forceNoble?: boolean },
): Promise<VerifyOutcome> {
  const forceNoble = opts?.forceNoble ?? false;
  try {
    const { payload, school, root } = bundle;

    // 1 — supported format.
    if (payload.v !== "sd-v2" || payload.h !== "sha-256") {
      return reject("unsupported payload version");
    }

    // 2 — PKI chain: the school certificate must chain to the CertifyChain root.
    const rootPub = pemToRawEd25519(root.publicKey);
    const certMessage = utf8ToBytes(
      canonicalize({
        schoolId: school.id,
        publicKey: school.publicKey,
        name: school.name,
        issuedAt: school.certIssuedAt,
      }),
    );
    if (!(await verifyEd25519(rootPub, certMessage, b64ToBytes(school.certificate), forceNoble))) {
      return reject("school certificate does not chain to the CertifyChain root");
    }

    // 3 — the payload must be bound to THIS certified school.
    if (payload.schoolId !== school.id) {
      return reject("payload schoolId does not match the certified school");
    }

    // 4 — signature: the school signed SHA-256(canonical payload).
    const schoolPub = pemToRawEd25519(school.publicKey);
    const signedMessage = sha256(utf8ToBytes(canonicalize(payload)));
    if (!(await verifyEd25519(schoolPub, signedMessage, b64ToBytes(bundle.signature), forceNoble))) {
      return reject("invalid school signature");
    }

    // 5 + 6 — every disclosure's digest must be in `_sd`; no duplicate digest or name.
    const sdSet = new Set(payload._sd);
    const disclosed: Record<string, unknown> = {};
    const seenDigests = new Set<string>();
    for (const d of bundle.disclosures) {
      const digest = digestOfDisclosure(d);
      if (!sdSet.has(digest)) return reject("a disclosure is not present in the signed payload");
      if (seenDigests.has(digest)) return reject("duplicate disclosure");
      const [, name, value] = parseDisclosureTriple(d);
      if (Object.prototype.hasOwnProperty.call(disclosed, name)) {
        return reject("two disclosures target the same field");
      }
      seenDigests.add(digest);
      disclosed[name] = value;
    }

    // 7 — verified.
    return { ok: true, disclosed, hidden: payload._sd.length - bundle.disclosures.length };
  } catch (e) {
    return reject(e instanceof Error ? e.message : "verification error");
  }
}
