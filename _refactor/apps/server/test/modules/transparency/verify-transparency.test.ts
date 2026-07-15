/**
 * verifyTransparency — end to end without DB (pattern of crypto/sd-v2.test.ts):
 * REAL production pieces (`buildSdV2Emission`, crypto/keys signing,
 * `buildIssuanceLeaf`, shared merkle) + a root-signed checkpoint, then the
 * SINGLE shared verifier that both the server and the browser run (v2.md §V3-4).
 *
 * The PKI root is a TEST key pair (not the env root): the checkpoint must be
 * signed by the same root the bundle carries, and only a locally generated key
 * can sign both the school certificate and the checkpoints here.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ProofBundleDTO, TransparencyProofDTO } from "@certifychain/contract/dto";
import { verifyProofBundle } from "@certifychain/shared/crypto/verify-bundle";
import { verifyTransparency } from "@certifychain/shared/crypto/verify-transparency";
import { canonicalize } from "../../../src/crypto/hashing";
import {
  generateEd25519KeyPair,
  signDiplomaHash,
  signEd25519,
} from "../../../src/crypto/keys";
import { buildSdV2Emission, type SdEmissionFields } from "../../../src/crypto/sd-emission";
import {
  buildIssuanceLeaf,
  inclusionProofHex,
  merkleRootHex,
} from "../../../src/modules/transparency/merkle";

/* ── Fixture: a v2 school + diploma + issuance log, signed like production ── */

const DIPLOMA_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_DIPLOMA_ID = "33333333-3333-4333-8333-333333333333";
const SCHOOL_ID = "11111111-1111-4111-8111-111111111111";
const CERT_ISSUED_AT = "2026-07-01";
const CHECKPOINT_AT = "2026-07-14T12:00:00.000Z";
const LEAF_INDEX = 2;
const TREE_SIZE = 5;

// Distinctive values so the substring-leak assertions cannot false-negative.
const FIELDS: SdEmissionFields = {
  holderName: "Zéphyrin Leakcheck",
  holderEmail: "leak.probe@example.com",
  programTitle: "MasterUltraSecretProgram",
  mention: "MentionUltraSecrete",
  rncp: "RNCP-LEAK-77",
  issuedAt: "1999-12-31",
  externalId: "EXT-LEAK-001",
};

/** Root-sign of {treeSize, rootHash, timestamp} — mirror of the server checkpoint signer. */
function signCheckpoint(
  rootPrivateKey: string,
  cp: { treeSize: number; rootHash: string; timestamp: string },
): string {
  return signEd25519(rootPrivateKey, Buffer.from(canonicalize(cp), "utf8"));
}

/** Rebuilds the full transparency extension over a given set of log leaves. */
function makeTransparency(
  leafHashes: string[],
  leafIndex: number,
  rootPrivateKey: string,
): TransparencyProofDTO {
  const rootHash = merkleRootHex(leafHashes);
  const cp = { treeSize: leafHashes.length, rootHash, timestamp: CHECKPOINT_AT };
  return {
    leafIndex,
    leafHash: leafHashes[leafIndex] as string,
    auditPath: inclusionProofHex(leafHashes, leafIndex),
    checkpoint: {
      ...cp,
      signature: signCheckpoint(rootPrivateKey, cp),
      otsAnchored: false,
      otsUpgradedAt: null,
      otsProof: null,
    },
  };
}

/** Deterministic sibling leaves, built with the SAME production leaf builder. */
function fillerLeafHashes(): string[] {
  return Array.from({ length: TREE_SIZE }, (_, k) =>
    buildIssuanceLeaf({
      diplomaId: `00000000-0000-4000-8000-00000000000${k}`,
      schoolId: SCHOOL_ID,
      payloadHash: "ab".repeat(32),
      signature: "dm9pc2luLXNpZ25hdHVyZQ==",
      issuedAt: "2026-01-01",
    }).leafHashHex,
  );
}

interface Fixture {
  bundle: ProofBundleDTO;
  rootPrivateKey: string;
  leafHashes: string[];
}

function buildFixture(disclosedFields: (keyof SdEmissionFields)[]): Fixture {
  const root = generateEd25519KeyPair();
  const school = generateEd25519KeyPair();
  // Mirror of issueSchoolCertificate (crypto/keys.ts), with the TEST root key.
  const certificate = signEd25519(
    root.privateKey,
    Buffer.from(
      canonicalize({
        schoolId: SCHOOL_ID,
        publicKey: school.publicKey,
        name: "École Journal Test",
        issuedAt: CERT_ISSUED_AT,
      }),
      "utf8",
    ),
  );
  const emission = buildSdV2Emission(DIPLOMA_ID, SCHOOL_ID, FIELDS);
  const signature = signDiplomaHash(school.privateKey, emission.payloadHash);
  const leafHashes = fillerLeafHashes();
  leafHashes[LEAF_INDEX] = buildIssuanceLeaf({
    diplomaId: DIPLOMA_ID,
    schoolId: SCHOOL_ID,
    payloadHash: emission.payloadHash,
    signature,
    issuedAt: FIELDS.issuedAt,
  }).leafHashHex;
  const bundle: ProofBundleDTO = {
    engine: "ed25519-sd-v2",
    payload: emission.sdPayload,
    signature,
    disclosures: disclosedFields.map((f) => emission.disclosureByField[f]),
    school: {
      id: SCHOOL_ID,
      name: "École Journal Test",
      publicKey: school.publicKey,
      certificate,
      certIssuedAt: CERT_ISSUED_AT,
    },
    root: { publicKey: root.publicKey },
    revocation: {
      checkedAt: new Date().toISOString(),
      status: "active",
      source: "http://localhost:4000/verify/revocation/" + DIPLOMA_ID,
    },
    transparency: makeTransparency(leafHashes, LEAF_INDEX, root.privateKey),
  };
  return { bundle, rootPrivateKey: root.privateKey, leafHashes };
}

const flipNibble = (hex: string): string => (hex.startsWith("0") ? "f" : "0") + hex.slice(1);

describe("verifyTransparency — bout-en-bout (pièces de prod, sans DB)", () => {
  it("accepts a genuine bundle with issuedAt disclosed → binding 'full'", async () => {
    const { bundle } = buildFixture(["issuedAt", "holderName"]);
    // Fixture sanity: the bundle itself is a REAL, verifiable v2 bundle.
    assert.equal((await verifyProofBundle(bundle)).ok, true);
    const outcome = await verifyTransparency(bundle);
    assert.deepEqual(outcome, {
      ok: true,
      binding: "full",
      leafIndex: LEAF_INDEX,
      treeSize: TREE_SIZE,
      checkpointTimestamp: CHECKPOINT_AT,
      otsUpgradedAt: null,
    });
  });

  it("returns the same verdict through the forced pure-JS @noble path", async () => {
    const { bundle } = buildFixture(["issuedAt"]);
    const viaDefault = await verifyTransparency(bundle);
    const viaNoble = await verifyTransparency(bundle, { forceNoble: true });
    assert.deepEqual(viaNoble, viaDefault);
    assert.equal(viaNoble.ok, true);
  });

  it("issuedAt NOT disclosed → ok with binding 'hash-only' and zero masked values in the outcome", async () => {
    const { bundle } = buildFixture(["holderName"]);
    const outcome = await verifyTransparency(bundle);
    assert.equal(outcome.ok, true);
    if (outcome.ok) assert.equal(outcome.binding, "hash-only");
    // Never guess nor expose a masked value: the serialized outcome must not
    // carry ANY diploma field value (not even the disclosed one).
    const serialized = JSON.stringify(outcome);
    for (const value of Object.values(FIELDS)) {
      assert.ok(!serialized.includes(value as string), `leaked value: ${value}`);
    }
  });

  it("rejects when the transparency extension is absent or null", async () => {
    const { bundle } = buildFixture(["issuedAt"]);
    const withoutField: ProofBundleDTO = { ...bundle };
    delete withoutField.transparency;
    const a = await verifyTransparency(withoutField);
    assert.deepEqual(a, { ok: false, reason: "no transparency proof" });
    const b = await verifyTransparency({ ...bundle, transparency: null });
    assert.deepEqual(b, { ok: false, reason: "no transparency proof" });
  });

  it("rejects a tampered checkpoint signature", async () => {
    const { bundle } = buildFixture(["issuedAt"]);
    const t = bundle.transparency as TransparencyProofDTO;
    t.checkpoint.signature = t.checkpoint.signature.slice(0, -4) + "AAAA";
    const outcome = await verifyTransparency(bundle);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.match(outcome.reason, /checkpoint signature/);
  });

  it("rejects a checkpoint signed by ANOTHER key than the bundle's root", async () => {
    const { bundle } = buildFixture(["issuedAt"]);
    const t = bundle.transparency as TransparencyProofDTO;
    const foreign = generateEd25519KeyPair();
    t.checkpoint.signature = signCheckpoint(foreign.privateKey, {
      treeSize: t.checkpoint.treeSize,
      rootHash: t.checkpoint.rootHash,
      timestamp: t.checkpoint.timestamp,
    });
    const outcome = await verifyTransparency(bundle);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.match(outcome.reason, /checkpoint signature/);
  });

  it("rejects an altered rootHash even when re-signed by the root", async () => {
    const { bundle, rootPrivateKey } = buildFixture(["issuedAt"]);
    const t = bundle.transparency as TransparencyProofDTO;
    const forgedRoot = flipNibble(t.checkpoint.rootHash);
    t.checkpoint.rootHash = forgedRoot;
    t.checkpoint.signature = signCheckpoint(rootPrivateKey, {
      treeSize: t.checkpoint.treeSize,
      rootHash: forgedRoot,
      timestamp: t.checkpoint.timestamp,
    });
    const outcome = await verifyTransparency(bundle);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.match(outcome.reason, /not included/);
  });

  it("rejects an altered audit path", async () => {
    const { bundle } = buildFixture(["issuedAt"]);
    const t = bundle.transparency as TransparencyProofDTO;
    t.auditPath = t.auditPath.map((h, i) => (i === 0 ? flipNibble(h) : h));
    const outcome = await verifyTransparency(bundle);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.match(outcome.reason, /not included/);
  });

  it("rejects a shifted leafIndex", async () => {
    const { bundle } = buildFixture(["issuedAt"]);
    const t = bundle.transparency as TransparencyProofDTO;
    t.leafIndex = LEAF_INDEX + 1;
    const outcome = await verifyTransparency(bundle);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.match(outcome.reason, /not included/);
  });

  it("rejects a (validly included) leaf belonging to ANOTHER diploma — binding check", async () => {
    const { bundle, rootPrivateKey, leafHashes } = buildFixture(["issuedAt"]);
    // A second diploma is genuinely logged at the same position in another tree…
    const emissionB = buildSdV2Emission(OTHER_DIPLOMA_ID, SCHOOL_ID, {
      ...FIELDS,
      holderName: "Une Autre Personne",
    });
    const leafB = buildIssuanceLeaf({
      diplomaId: OTHER_DIPLOMA_ID,
      schoolId: SCHOOL_ID,
      payloadHash: emissionB.payloadHash,
      signature: "YXV0cmUtc2lnbmF0dXJl",
      issuedAt: FIELDS.issuedAt,
    });
    const otherLeaves = [...leafHashes];
    otherLeaves[LEAF_INDEX] = leafB.leafHashHex;
    // …and its (valid!) proof gets glued onto diploma A's bundle.
    bundle.transparency = makeTransparency(otherLeaves, LEAF_INDEX, rootPrivateKey);
    const outcome = await verifyTransparency(bundle);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.match(outcome.reason, /does not match this diploma/);
  });
});
