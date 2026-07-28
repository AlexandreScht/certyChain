/**
 * Root rotation — server-side list support (audit 2026-07-28,
 * docs/security/root-secrets-rotation.md §4).
 *
 * Before this change, `SERVER_TRUSTED_ROOTS` (`apps/server/src/modules/verify/
 * verify.routes.ts`) and `crypto/keys.ts#verifySchoolCertificate` only ever
 * knew ONE Ed25519 root — the exact gap the rotation doc flagged as making
 * the coexistence-window ceremony non-executable: the moment the server's
 * PRIVATE signing key switched to a new root, it would stop verifying every
 * school certificate issued under the OLD one.
 *
 * This suite exercises `findTrustedEd25519RootFor` / `verifySchoolCertificate`
 * directly against a manually-built two-root trust set (it does not reload
 * `config/env.ts` — that CSV-parsing/fail-fast side is covered by
 * `tests/jest/server/env-root-keys-csv.spec.ts`), plus `verifyProofBundle`
 * itself to prove the browser-side "unknown root" vs "invalid signature"
 * distinction still holds against a list.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ProofBundleDTO } from "@certifychain/contract/dto";
import { verifyProofBundle, type TrustedRoots } from "@certifychain/shared/crypto/verify-bundle";
import { canonicalize } from "../../src/crypto/hashing";
import {
  generateEd25519KeyPair,
  signDiplomaHash,
  signEd25519,
  verifyEd25519,
} from "../../src/crypto/keys";
import { buildSdV2Emission, type SdEmissionFields } from "../../src/crypto/sd-emission";

const DIPLOMA_ID = "66666666-6666-4666-8666-666666666666";
const SCHOOL_ID = "22222222-2222-4222-8222-222222222222";
const CERT_ISSUED_AT = "2026-07-01";
const SCHOOL_NAME = "École Rotation Test";
const FIELDS: SdEmissionFields = {
  holderName: "Camille Martin",
  holderEmail: "camille@example.com",
  programTitle: "Licence Informatique",
  mention: "AB",
  rncp: "RNCP12345",
  issuedAt: "2026-06-30",
  externalId: null,
};

/** Mirrors `crypto/keys.ts#findTrustedEd25519RootFor`, parametrized over an
 *  ARBITRARY trusted list (rather than reading `env.certifychainRootPublicKeys`)
 *  so this suite can exercise a two-root scenario without reloading `env.ts`. */
function findTrustedRootFor(
  payload: { schoolId: string; publicKey: string; name: string; issuedAt: string },
  certB64: string,
  trustedPems: readonly string[],
): string | null {
  const message = Buffer.from(canonicalize(payload), "utf8");
  for (const pem of trustedPems) {
    if (verifyEd25519(pem, message, certB64)) return pem;
  }
  return null;
}

describe("root rotation — multi-root trust list (docs/security/root-secrets-rotation.md §4)", () => {
  it("a certificate signed by the OUTGOING root still matches when the incoming root is listed first", () => {
    const incoming = generateEd25519KeyPair();
    const outgoing = generateEd25519KeyPair();
    // Convention: index 0 = current signer. Here nobody signs with `incoming`
    // yet — this cert predates the rotation, exactly the case the doc's §4
    // step 5 says must keep working.
    const trusted = [incoming.publicKey, outgoing.publicKey];

    const payload = { schoolId: SCHOOL_ID, publicKey: generateEd25519KeyPair().publicKey, name: SCHOOL_NAME, issuedAt: CERT_ISSUED_AT };
    const certSignedByOutgoing = signEd25519(outgoing.privateKey, Buffer.from(canonicalize(payload), "utf8"));

    const match = findTrustedRootFor(payload, certSignedByOutgoing, trusted);
    assert.equal(match, outgoing.publicKey);
  });

  it("a certificate signed by the CURRENT (incoming) root also matches, from the same two-root list", () => {
    const incoming = generateEd25519KeyPair();
    const outgoing = generateEd25519KeyPair();
    const trusted = [incoming.publicKey, outgoing.publicKey];

    const payload = { schoolId: SCHOOL_ID, publicKey: generateEd25519KeyPair().publicKey, name: SCHOOL_NAME, issuedAt: CERT_ISSUED_AT };
    const certSignedByIncoming = signEd25519(incoming.privateKey, Buffer.from(canonicalize(payload), "utf8"));

    const match = findTrustedRootFor(payload, certSignedByIncoming, trusted);
    assert.equal(match, incoming.publicKey);
  });

  it("a certificate signed by neither trusted root matches nothing (null, not a false positive)", () => {
    const incoming = generateEd25519KeyPair();
    const outgoing = generateEd25519KeyPair();
    const attacker = generateEd25519KeyPair();
    const trusted = [incoming.publicKey, outgoing.publicKey];

    const payload = { schoolId: SCHOOL_ID, publicKey: generateEd25519KeyPair().publicKey, name: SCHOOL_NAME, issuedAt: CERT_ISSUED_AT };
    const forgedCert = signEd25519(attacker.privateKey, Buffer.from(canonicalize(payload), "utf8"));

    assert.equal(findTrustedRootFor(payload, forgedCert, trusted), null);
  });

  it("verifyProofBundle: a bundle whose declared root is the SECOND entry of a two-root trusted list still verifies", async () => {
    const currentRoot = generateEd25519KeyPair();
    const outgoingRoot = generateEd25519KeyPair();
    const trustedRoots: TrustedRoots = { ed25519: [currentRoot.publicKey, outgoingRoot.publicKey], mlDsa65: [] };

    const school = generateEd25519KeyPair();
    const certPayload = { schoolId: SCHOOL_ID, publicKey: school.publicKey, name: SCHOOL_NAME, issuedAt: CERT_ISSUED_AT };
    // This school was certified BEFORE the rotation — signed by the outgoing root.
    const certificate = signEd25519(outgoingRoot.privateKey, Buffer.from(canonicalize(certPayload), "utf8"));

    const emission = buildSdV2Emission(DIPLOMA_ID, SCHOOL_ID, FIELDS);
    const bundle: ProofBundleDTO = {
      engine: "ed25519-sd-v2",
      payload: emission.sdPayload,
      signature: signDiplomaHash(school.privateKey, emission.payloadHash),
      disclosures: [emission.disclosureByField.holderName],
      school: {
        id: SCHOOL_ID,
        name: SCHOOL_NAME,
        publicKey: school.publicKey,
        certificate,
        certIssuedAt: CERT_ISSUED_AT,
      },
      // The server embeds the root that ACTUALLY signed this school's
      // certificate (`findTrustedEd25519RootFor`), never blindly "current".
      root: { publicKey: outgoingRoot.publicKey },
      revocation: {
        checkedAt: new Date().toISOString(),
        status: "active",
        source: `http://localhost:4000/verify/revocation/${DIPLOMA_ID}`,
      },
    };

    const outcome = await verifyProofBundle(bundle, trustedRoots);
    assert.equal(outcome.ok, true);
  });

  it("verifyProofBundle: an UNKNOWN third root is rejected with an 'unknown root' reason, never 'invalid signature' — even against a two-entry trusted list", async () => {
    const currentRoot = generateEd25519KeyPair();
    const outgoingRoot = generateEd25519KeyPair();
    const attackerRoot = generateEd25519KeyPair();
    const trustedRoots: TrustedRoots = { ed25519: [currentRoot.publicKey, outgoingRoot.publicKey], mlDsa65: [] };

    const school = generateEd25519KeyPair();
    const certPayload = { schoolId: SCHOOL_ID, publicKey: school.publicKey, name: SCHOOL_NAME, issuedAt: CERT_ISSUED_AT };
    // Fully self-consistent forgery: attacker's own root signs its own "school".
    const certificate = signEd25519(attackerRoot.privateKey, Buffer.from(canonicalize(certPayload), "utf8"));

    const emission = buildSdV2Emission(DIPLOMA_ID, SCHOOL_ID, FIELDS);
    const bundle: ProofBundleDTO = {
      engine: "ed25519-sd-v2",
      payload: emission.sdPayload,
      signature: signDiplomaHash(school.privateKey, emission.payloadHash),
      disclosures: [emission.disclosureByField.holderName],
      school: {
        id: SCHOOL_ID,
        name: SCHOOL_NAME,
        publicKey: school.publicKey,
        certificate,
        certIssuedAt: CERT_ISSUED_AT,
      },
      root: { publicKey: attackerRoot.publicKey },
      revocation: {
        checkedAt: new Date().toISOString(),
        status: "active",
        source: `http://localhost:4000/verify/revocation/${DIPLOMA_ID}`,
      },
    };

    const outcome = await verifyProofBundle(bundle, trustedRoots);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.match(outcome.reason, /unknown PKI root/i);
      assert.doesNotMatch(outcome.reason, /invalid.*signature/i);
    }
  });
});
