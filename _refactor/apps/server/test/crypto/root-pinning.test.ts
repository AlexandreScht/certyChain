/**
 * Root pinning (audit 2026-07-27) — server-side mirror of
 * `tests/jest/shared/verify-bundle-root-pinning.spec.ts`. `verifyProofBundle`
 * is the SAME shared implementation the server route runs
 * (`apps/server/src/modules/verify/verify.routes.ts`, `SERVER_TRUSTED_ROOTS`)
 * as the recruiter's browser — this suite proves the closed vulnerability
 * from the server's side, using the SAME production primitives
 * (`crypto/keys.ts`, `crypto/sd-emission.ts`) the route itself uses.
 *
 * The decisive case: a bundle whose root, school and diploma are ALL forged
 * by an attacker (their own root key pair, self-signed "school" certificate,
 * self-signed "diploma") is internally 100% consistent — every signature
 * checks out against itself — and MUST still be rejected once verified
 * against the server's real trusted root, with a reason distinct from
 * "invalid signature".
 */
import assert from "node:assert/strict";
import { sign as nodeSign, createPrivateKey } from "node:crypto";
import { describe, it } from "node:test";

import type { ProofBundleDTO } from "@certifychain/contract/dto";
import { verifyProofBundle, type TrustedRoots } from "@certifychain/shared/crypto/verify-bundle";
import { canonicalize } from "../../src/crypto/hashing";
import {
  certifychainRootPublicKeyPem,
  generateEd25519KeyPair,
  issueSchoolCertificate,
  signDiplomaHash,
} from "../../src/crypto/keys";
import { buildSdV2Emission, type SdEmissionFields } from "../../src/crypto/sd-emission";

const DIPLOMA_ID = "55555555-5555-4555-8555-555555555555";
const SCHOOL_ID = "11111111-1111-4111-8111-111111111111";
const CERT_ISSUED_AT = "2026-07-01";
const SCHOOL_NAME = "École Root Pinning Test";
const FIELDS: SdEmissionFields = {
  holderName: "Alex Dubois",
  holderEmail: "alex@example.com",
  programTitle: "Master Data Science",
  mention: "TB",
  rncp: "RNCP34031",
  issuedAt: "2026-06-30",
  externalId: null,
};

/** The REAL server trust anchor — same construction as `SERVER_TRUSTED_ROOTS`
 *  in `verify.routes.ts` (mlDsa65 empty: this suite only exercises v2/classical). */
const SERVER_TRUSTED_ROOTS: TrustedRoots = { ed25519: [certifychainRootPublicKeyPem()], mlDsa65: [] };

/** Signs `payload`'s canonical form with an ARBITRARY private key — the exact
 *  mirror of `crypto/keys.ts#issueSchoolCertificate`, except that function
 *  always signs with the server's OWN env root (by design, production code
 *  should never sign with an attacker-chosen key). This lets the test build a
 *  certificate "issued" by a root THIS TEST controls, to simulate the forgery. */
function signCertificateWith(
  rootPrivateKeyPem: string,
  payload: { schoolId: string; publicKey: string; name: string; issuedAt: string },
): string {
  return nodeSign(null, Buffer.from(canonicalize(payload), "utf8"), createPrivateKey(rootPrivateKeyPem)).toString(
    "base64",
  );
}

/** A fully self-consistent v2 bundle root-"signed" by `rootPrivateKeyPem` —
 *  legitimate when that's the server's real root, forged when it's an
 *  attacker-generated one. Either way every signature verifies against itself. */
function buildBundle(rootPublicKeyPem: string, rootPrivateKeyPem: string): ProofBundleDTO {
  const school = generateEd25519KeyPair();
  const certificate = signCertificateWith(rootPrivateKeyPem, {
    schoolId: SCHOOL_ID,
    publicKey: school.publicKey,
    name: SCHOOL_NAME,
    issuedAt: CERT_ISSUED_AT,
  });
  const emission = buildSdV2Emission(DIPLOMA_ID, SCHOOL_ID, FIELDS);
  const signature = signDiplomaHash(school.privateKey, emission.payloadHash);
  return {
    engine: "ed25519-sd-v2",
    payload: emission.sdPayload,
    signature,
    disclosures: [emission.disclosureByField.holderName],
    school: {
      id: SCHOOL_ID,
      name: SCHOOL_NAME,
      publicKey: school.publicKey,
      certificate,
      certIssuedAt: CERT_ISSUED_AT,
    },
    root: { publicKey: rootPublicKeyPem },
    revocation: {
      checkedAt: new Date().toISOString(),
      status: "active",
      source: `http://localhost:4000/verify/revocation/${DIPLOMA_ID}`,
    },
  };
}

describe("verifyProofBundle — root pinning, server side (audit 2026-07-27)", () => {
  it("REJECTS an entirely self-forged bundle (attacker's own root, school and diploma) against the server's real trusted root", async () => {
    const attackerRoot = generateEd25519KeyPair();
    const forgedBundle = buildBundle(attackerRoot.publicKey, attackerRoot.privateKey);

    const outcome = await verifyProofBundle(forgedBundle, SERVER_TRUSTED_ROOTS);

    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.match(outcome.reason, /certifychain/i);
      assert.doesNotMatch(outcome.reason, /invalid.*signature/i);
    }
  });

  it("non-regression: a bundle signed under the REAL server root still verifies", async () => {
    // Exercise the REAL `issueSchoolCertificate` (env root) for the certificate,
    // not the local `signCertificateWith` mirror, so this path is covered too.
    const school = generateEd25519KeyPair();
    const certificate = issueSchoolCertificate({
      schoolId: SCHOOL_ID,
      publicKey: school.publicKey,
      name: SCHOOL_NAME,
      issuedAt: CERT_ISSUED_AT,
    });
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
      root: { publicKey: certifychainRootPublicKeyPem() },
      revocation: {
        checkedAt: new Date().toISOString(),
        status: "active",
        source: `http://localhost:4000/verify/revocation/${DIPLOMA_ID}`,
      },
    };

    const outcome = await verifyProofBundle(bundle, SERVER_TRUSTED_ROOTS);
    assert.equal(outcome.ok, true);
  });

  it("an EMPTY trusted-root list rejects even a genuine, real-root-signed bundle", async () => {
    const attackerRoot = generateEd25519KeyPair();
    // Root value here is irrelevant to this assertion — an empty trusted list
    // rejects EVERYTHING before it even looks at the bundle's declared root.
    const bundle = buildBundle(attackerRoot.publicKey, attackerRoot.privateKey);
    const outcome = await verifyProofBundle(bundle, { ed25519: [], mlDsa65: [] });
    assert.deepEqual(outcome, {
      ok: false,
      reason: "no trusted CertifyChain root configured — refusing to verify",
    });
  });
});
