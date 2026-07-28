import { sha256 } from "@noble/hashes/sha256";
import type { ProofBundleDTO } from "@certifychain/contract/dto";
import { mlDsaVerify } from "./ml-dsa";
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
import { isTrustedEd25519Root, isTrustedMlDsaRoot, type TrustedRoots } from "./trusted-roots";

export type { TrustedRoots } from "./trusted-roots";

/**
 * `verifyProofBundle` — the SINGLE implementation of the ed25519-sd-v2 /
 * ed25519-sd-v3 verification algorithm (v2.md §V1-2 / §V4-1), used verbatim by
 * the SERVER (its own verdict) AND by the recruiter's BROWSER. One
 * implementation ⇒ no server/client divergence (the exact design bug of legacy
 * audit #9).
 *
 * Pure and framework/serverless-free by contract (CLAUDE.md §3): NO `node:*`,
 * hono or drizzle imports — it runs unchanged in a browser and in Node. Ed25519
 * uses WebCrypto when `crypto.subtle` exposes it, else the pure-JS `@noble`
 * fallback (both paths are exercised in tests; the fallback is forceable).
 * ML-DSA-65 (post-quantum) always runs through the pure-JS `@noble/post-quantum`
 * wrapper (`./ml-dsa`) — there is no WebCrypto equivalent to fall back from.
 * Encoding/canonicalization/Ed25519 helpers live in `./primitives` (shared with
 * `verify-transparency.ts`).
 *
 * It verifies authenticity + PKI chain + disclosure integrity. It deliberately
 * says NOTHING about revocation: that is a fact posterior to signing and needs a
 * network call (`bundle.revocation`). Never show "Verified" on crypto alone.
 *
 * ── Root pinning (audit 2026-07-27) ────────────────────────────────────────
 * `trustedRoots` is a MANDATORY second argument, never optional: the PKI root
 * this function chains `school.certificate` against is `bundle.root.publicKey`,
 * which is DATA carried by the very artifact being verified. Trusting it on its
 * own would let an attacker forge a self-consistent bundle — their own root key
 * pair, a certificate they root-signed themselves, a school key they control —
 * and have it verify successfully against ITSELF. `trustedRoots` is the
 * caller's actual anchor (server: `config/env.ts`; browser: `NEXT_PUBLIC_*`
 * inlined at build time — see `apps/client/web/src/lib/trusted-roots.ts`) and
 * is checked FIRST, before any other cryptographic step, with a reason
 * ("this proof was not issued by CertifyChain") never conflated with "invalid
 * signature". An empty `trustedRoots.ed25519` is an error, not a bypass.
 *
 * ── Hybrid post-quantum (v2.md §V4-1) ──────────────────────────────────────
 * This function NEVER reads a policy flag (the browser doesn't know
 * `PQ_POLICY` — that is a server-only variable): it deduces the requirement
 * from the bundle itself. `payload.v === "sd-v3"` means the diploma carries a
 * mandatory ML-DSA-65 signature IN ADDITION to Ed25519, and the school
 * certificate is ALSO root-signed in ML-DSA-65 in addition to Ed25519 — BOTH
 * signatures of BOTH pairs must verify (hybrid "AND", never "OR": "OR" would
 * only be as strong as the weaker of the two algorithms). A `"sd-v2"` payload
 * is verified EXACTLY as before — this is an additive extension, not a rewrite.
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
 * @param trustedRoots the ONLY CertifyChain PKI root(s) this call trusts — see
 *        the module doc above. MANDATORY (never optional: an optional param
 *        would silently fall back to the exact bypass this closes), and its
 *        `ed25519` list MUST be non-empty or verification refuses everything.
 * @param opts.forceNoble force the pure-JS @noble path (skip WebCrypto) — used by
 *        tests to prove the fallback works; harmless in production.
 */
export async function verifyProofBundle(
  bundle: ProofBundleDTO,
  trustedRoots: TrustedRoots,
  opts?: { forceNoble?: boolean },
): Promise<VerifyOutcome> {
  const forceNoble = opts?.forceNoble ?? false;
  try {
    const { payload, school, root } = bundle;

    // 0 — root pinning, BEFORE any other check (cryptographic or structural):
    // a bundle's OWN `root.publicKey` is data under attacker control and must
    // never be treated as ground truth. An empty trusted list is a caller
    // configuration error, not "trust anything" — refuse everything instead.
    if (trustedRoots.ed25519.length === 0) {
      return reject("no trusted CertifyChain root configured — refusing to verify");
    }
    if (!isTrustedEd25519Root(root.publicKey, trustedRoots.ed25519)) {
      return reject("this proof was not issued by CertifyChain (unknown PKI root)");
    }

    // 1 — supported format. `sd-v3` is `sd-v2` PLUS a mandatory PQ signature
    // (checked below) — deduced from the payload itself, never from a policy flag.
    if ((payload.v !== "sd-v2" && payload.v !== "sd-v3") || payload.h !== "sha-256") {
      return reject("unsupported payload version");
    }
    const isV3 = payload.v === "sd-v3";

    // 2 — PKI chain: the school certificate must chain to the CertifyChain root
    // (now confirmed trusted, above).
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

    // 2-PQ — hybrid "AND": a v3 bundle must ALSO carry a school certificate
    // root-signed in ML-DSA-65, over the SAME canonical shape but binding the
    // school's PQ public key (not the Ed25519 one). Missing/invalid ⇒ reject.
    if (isV3) {
      if (!school.publicKeyPq || !school.certificatePq || !root.publicKeyPq) {
        return reject("v3 bundle is missing post-quantum school certificate material");
      }
      // Root pinning applies to the post-quantum root exactly like the
      // classical one, before the PQ certificate signature is checked.
      if (!isTrustedMlDsaRoot(root.publicKeyPq, trustedRoots.mlDsa65)) {
        return reject("this proof was not issued by CertifyChain (unknown post-quantum PKI root)");
      }
      const certMessagePq = utf8ToBytes(
        canonicalize({
          schoolId: school.id,
          publicKey: school.publicKeyPq,
          name: school.name,
          issuedAt: school.certIssuedAt,
        }),
      );
      const rootPubPq = b64ToBytes(root.publicKeyPq);
      const certPq = b64ToBytes(school.certificatePq);
      if (!mlDsaVerify(rootPubPq, certMessagePq, certPq)) {
        return reject("school certificate does not chain to the CertifyChain post-quantum root");
      }
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

    // 4-PQ — hybrid "AND": a v3 bundle must ALSO carry a valid ML-DSA-65
    // signature, by the school's PQ key, over the SAME signed message
    // (SHA-256(canonical payload)) — never a different message (v2.md §V4-1:
    // "same message, two signatures"). Missing/invalid ⇒ reject: never "OR".
    if (isV3) {
      if (!bundle.signaturePq || !school.publicKeyPq) {
        return reject("v3 bundle is missing the post-quantum school signature");
      }
      const schoolPubPq = b64ToBytes(school.publicKeyPq);
      const sigPq = b64ToBytes(bundle.signaturePq);
      if (!mlDsaVerify(schoolPubPq, signedMessage, sigPq)) {
        return reject("invalid post-quantum school signature");
      }
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
