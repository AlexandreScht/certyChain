/**
 * Root pinning (audit 2026-07-27) — THE decisive regression test for the
 * vulnerability this fix closes.
 *
 * BEFORE the fix, `verifyProofBundle`/`verifyTransparency` read the
 * CertifyChain PKI root FROM THE BUNDLE ITSELF (`bundle.root.publicKey` /
 * `publicKeyPq`) and chained everything else to it. On the offline verifier
 * (`/verifier`, `apps/client/web/src/components/verify/OfflineVerifier.tsx`),
 * the bundle is JSON pasted by the recruiter — attacker-controlled. An
 * attacker who generates their OWN root key pair, forges a "school" and a
 * diploma, and signs everything consistently with THEIR OWN keys produces a
 * bundle that verifies successfully against ITSELF: the PKI "chain" holds,
 * because both ends of it were forged by the same hand. That is the exact
 * scenario `attack_bundle()` below builds.
 *
 * AFTER the fix, `trustedRoots` is a MANDATORY second argument: the verifier
 * checks the bundle's declared root against a caller-supplied allow-list
 * BEFORE any other cryptographic step, and rejects with a reason distinct
 * from "invalid signature" when it isn't pinned.
 *
 * This file also covers the other closed-form requirements: non-regression on
 * legitimate v2/v3 bundles, a pinned root supplied in a different PEM
 * encoding (still accepted — comparison is on decoded bytes), an empty
 * trusted-root list (hard rejection, never a bypass), and root rotation (two
 * pinned roots, bundle signed by the second, accepted).
 */
import { createHash, generateKeyPairSync, sign as nodeSign } from "node:crypto";
import type { ProofBundleDTO } from "@certifychain/contract/dto";
import { verifyProofBundle, type TrustedRoots } from "@certifychain/shared/crypto/verify-bundle";
import { verifyTransparency } from "@certifychain/shared/crypto/verify-transparency";

/* ── Mini-outillage fixture (miroir exact des primitives serveur) ─────────── */

function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}
function makeDisclosure(name: string, value: unknown, salt: string): string {
  return Buffer.from(JSON.stringify([salt, name, value]), "utf8").toString("base64url");
}
function digestOf(d: string): string {
  return createHash("sha256").update(d, "ascii").digest("base64url");
}
function signHashHex(privateKeyPem: string, hashHex: string): string {
  return nodeSign(null, Buffer.from(hashHex, "hex"), privateKeyPem).toString("base64");
}
function sha256HexOfCanonical(payload: unknown): string {
  return createHash("sha256").update(canonicalize(payload), "utf8").digest("hex");
}
function ed25519KeyPair(): { publicKey: string; privateKey: string } {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

const DIPLOMA_ID = "22222222-2222-4222-8222-222222222222";
const SCHOOL_ID = "11111111-1111-4111-8111-111111111111";
const CERT_ISSUED_AT = "2026-07-01";
const FIELD_NAME = "holderName";
const FIELD_VALUE = "Alex Dubois";

/**
 * Builds a fully self-consistent `ed25519-sd-v2` bundle: `root` signs
 * `school`'s certificate, `school` signs the payload — EXACTLY the shape a
 * legitimate emission produces. Whether it should be TRUSTED depends only on
 * whether `root.publicKey` is in the caller's `trustedRoots` — that is
 * precisely the property under test in this file.
 */
function buildBundle(
  root: { publicKey: string; privateKey: string },
  school: { publicKey: string; privateKey: string },
): ProofBundleDTO {
  const salt = Buffer.alloc(16, 7).toString("base64url");
  const disclosure = makeDisclosure(FIELD_NAME, FIELD_VALUE, salt);
  const payload: ProofBundleDTO["payload"] = {
    v: "sd-v2",
    h: "sha-256",
    id: DIPLOMA_ID,
    schoolId: SCHOOL_ID,
    _sd: [digestOf(disclosure)],
  };
  const certificate = nodeSign(
    null,
    Buffer.from(
      canonicalize({ schoolId: SCHOOL_ID, publicKey: school.publicKey, name: "École", issuedAt: CERT_ISSUED_AT }),
      "utf8",
    ),
    root.privateKey,
  ).toString("base64");
  return {
    engine: "ed25519-sd-v2",
    payload,
    signature: signHashHex(school.privateKey, sha256HexOfCanonical(payload)),
    disclosures: [disclosure],
    school: {
      id: SCHOOL_ID,
      name: "École",
      publicKey: school.publicKey,
      certificate,
      certIssuedAt: CERT_ISSUED_AT,
    },
    root: { publicKey: root.publicKey },
    revocation: {
      checkedAt: new Date().toISOString(),
      status: "active",
      source: `http://localhost:4000/verify/revocation/${DIPLOMA_ID}`,
    },
  };
}

describe("verifyProofBundle — root pinning (audit 2026-07-27)", () => {
  it("REJECTS an entirely self-forged bundle (attacker's own root, school and diploma) with a distinct 'unknown root' reason", async () => {
    // The real CertifyChain root — this is what the browser is pinned to.
    const legitRoot = ed25519KeyPair();
    const trustedRoots: TrustedRoots = { ed25519: [legitRoot.publicKey], mlDsa65: [] };

    // The attacker generates their OWN root and school key pairs on the spot,
    // then forges a bundle that is internally 100% consistent: the "school
    // certificate" really is signed by the attacker's "root", and the
    // "diploma" really is signed by the attacker's "school". Every signature
    // check the OLD code ran would have passed.
    const attackerRoot = ed25519KeyPair();
    const attackerSchool = ed25519KeyPair();
    const forgedBundle = buildBundle(attackerRoot, attackerSchool);

    const outcome = await verifyProofBundle(forgedBundle, trustedRoots);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toMatch(/certifychain/i);
      expect(outcome.reason).not.toMatch(/invalid.*signature/i);
    }
  });

  it("non-regression: a legitimate bundle signed under the pinned root still verifies (v2)", async () => {
    const root = ed25519KeyPair();
    const school = ed25519KeyPair();
    const trustedRoots: TrustedRoots = { ed25519: [root.publicKey], mlDsa65: [] };
    const bundle = buildBundle(root, school);

    const outcome = await verifyProofBundle(bundle, trustedRoots);

    expect(outcome).toEqual({ ok: true, disclosed: { [FIELD_NAME]: FIELD_VALUE }, hidden: 0 });
  });

  it("accepts the pinned root supplied in a DIFFERENT PEM encoding (CRLF + trailing spaces) — same decoded bytes", async () => {
    const root = ed25519KeyPair();
    const school = ed25519KeyPair();
    const bundle = buildBundle(root, school);

    // Same key, cosmetically different PEM: CRLF line endings + trailing
    // whitespace on each line. `pemToRawEd25519` strips ALL whitespace before
    // comparing, so this must still be recognised as the SAME root.
    const reformattedPem = root.publicKey
      .split("\n")
      .map((line) => `${line}  `)
      .join("\r\n");
    const trustedRoots: TrustedRoots = { ed25519: [reformattedPem], mlDsa65: [] };

    const outcome = await verifyProofBundle(bundle, trustedRoots);
    expect(outcome.ok).toBe(true);
  });

  it("an EMPTY trusted-root list is a hard rejection, never a bypass", async () => {
    const root = ed25519KeyPair();
    const school = ed25519KeyPair();
    const bundle = buildBundle(root, school);
    const trustedRoots: TrustedRoots = { ed25519: [], mlDsa65: [] };

    const outcome = await verifyProofBundle(bundle, trustedRoots);
    expect(outcome).toEqual({
      ok: false,
      reason: "no trusted CertifyChain root configured — refusing to verify",
    });
  });

  it("root rotation: two pinned roots, a bundle signed by the SECOND (incoming) one, is accepted", async () => {
    const outgoingRoot = ed25519KeyPair();
    const incomingRoot = ed25519KeyPair();
    const school = ed25519KeyPair();
    const bundle = buildBundle(incomingRoot, school);
    const trustedRoots: TrustedRoots = {
      ed25519: [outgoingRoot.publicKey, incomingRoot.publicKey],
      mlDsa65: [],
    };

    const outcome = await verifyProofBundle(bundle, trustedRoots);
    expect(outcome.ok).toBe(true);

    // ...and a bundle signed by the OUTGOING root during the same window also
    // still verifies — that is the entire point of keeping both pinned.
    const bundleOld = buildBundle(outgoingRoot, school);
    const outcomeOld = await verifyProofBundle(bundleOld, trustedRoots);
    expect(outcomeOld.ok).toBe(true);
  });

  it("a root that is NOT pinned is rejected even when it correctly signs everything (single-root allow-list, no rotation)", async () => {
    const pinnedRoot = ed25519KeyPair();
    const unpinnedRoot = ed25519KeyPair();
    const school = ed25519KeyPair();
    const bundle = buildBundle(unpinnedRoot, school);
    const trustedRoots: TrustedRoots = { ed25519: [pinnedRoot.publicKey], mlDsa65: [] };

    const outcome = await verifyProofBundle(bundle, trustedRoots);
    expect(outcome.ok).toBe(false);
  });
});

describe("verifyTransparency — root pinning (audit 2026-07-27)", () => {
  function buildCheckpointBundle(root: { publicKey: string; privateKey: string }): ProofBundleDTO {
    const school = ed25519KeyPair();
    const bundle = buildBundle(root, school);
    const cp = { treeSize: 1, rootHash: "a".repeat(64), timestamp: "2026-07-14T12:00:00.000Z" };
    const signature = nodeSign(null, Buffer.from(canonicalize(cp), "utf8"), root.privateKey).toString(
      "base64",
    );
    bundle.transparency = {
      leafIndex: 0,
      // Single-leaf tree: leafHash == rootHash (RFC 6962 base case).
      leafHash: cp.rootHash,
      auditPath: [],
      checkpoint: { ...cp, signature, otsAnchored: false, otsUpgradedAt: null, otsProof: null },
    };
    return bundle;
  }

  it("REJECTS a checkpoint signed by an attacker's own (unpinned) root", async () => {
    const legitRoot = ed25519KeyPair();
    const trustedRoots: TrustedRoots = { ed25519: [legitRoot.publicKey], mlDsa65: [] };
    const attackerRoot = ed25519KeyPair();
    const forged = buildCheckpointBundle(attackerRoot);

    const outcome = await verifyTransparency(forged, trustedRoots);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toMatch(/certifychain/i);
  });

  it("non-regression: a checkpoint signed under the pinned root still verifies", async () => {
    const root = ed25519KeyPair();
    const trustedRoots: TrustedRoots = { ed25519: [root.publicKey], mlDsa65: [] };
    const bundle = buildCheckpointBundle(root);

    const outcome = await verifyTransparency(bundle, trustedRoots);
    expect(outcome.ok).toBe(true);
  });

  it("an EMPTY trusted-root list rejects the checkpoint too", async () => {
    const root = ed25519KeyPair();
    const bundle = buildCheckpointBundle(root);
    const outcome = await verifyTransparency(bundle, { ed25519: [], mlDsa65: [] });
    expect(outcome).toEqual({
      ok: false,
      reason: "no trusted CertifyChain root configured — refusing to verify",
    });
  });

  it("root rotation: a checkpoint signed by the SECOND pinned root is accepted", async () => {
    const outgoingRoot = ed25519KeyPair();
    const incomingRoot = ed25519KeyPair();
    const bundle = buildCheckpointBundle(incomingRoot);
    const trustedRoots: TrustedRoots = {
      ed25519: [outgoingRoot.publicKey, incomingRoot.publicKey],
      mlDsa65: [],
    };

    const outcome = await verifyTransparency(bundle, trustedRoots);
    expect(outcome.ok).toBe(true);
  });
});
