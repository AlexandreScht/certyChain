/**
 * checkpoint.service — WITHOUT a database (pattern of crypto/signer.ts: inject the
 * seams). A tiny in-memory `CheckpointStore` stands in for the DB, the clock is
 * injected, and the checkpoint signer uses a TEST root key so the signature is
 * verifiable with the same primitives the shared browser verifier runs.
 *
 * Proves: (1) the signed canonical form is exactly {treeSize, rootHash, timestamp}
 * and the root is a valid RFC 6962 root (shared verifyInclusion); (2) on-demand
 * coverage is single-flight (one insert for concurrent callers); (3) the cron
 * checkpoint is debounced; (4) OTS stamp+upgrade run through the injected client.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { verifyInclusion } from "@certifychain/shared/crypto/merkle";
import { canonicalize } from "../../../src/crypto/hashing";
import { generateEd25519KeyPair, signEd25519, verifyEd25519 } from "../../../src/crypto/keys";
import type { LogCheckpointPayload } from "../../../src/crypto";
import type { LogCheckpoint } from "../../../src/db/schema";
import {
  createCheckpointService,
  toLogCheckpointDTO,
  type CheckpointStore,
  type OtsAnchorClient,
} from "../../../src/modules/transparency/checkpoint.service";
import { buildIssuanceLeaf, inclusionProofHex } from "../../../src/modules/transparency/merkle";

/* ── In-memory store ─────────────────────────────────────────────────────── */

interface FakeStore {
  store: CheckpointStore;
  leaves: string[];
  checkpoints: LogCheckpoint[];
  inserts(): number;
}

function makeFakeStore(initialLeaves: string[] = [], insertDelayMs = 0): FakeStore {
  const leaves = [...initialLeaves];
  const checkpoints: LogCheckpoint[] = [];
  let inserts = 0;

  const store: CheckpointStore = {
    async leavesFrom(fromIndex) {
      return leaves
        .slice(fromIndex)
        .map((leafHash, i) => ({ leafIndex: fromIndex + i, leafHash }));
    },
    async latestCheckpoint() {
      if (checkpoints.length === 0) return null;
      return [...checkpoints].sort(
        (a, b) => b.treeSize - a.treeSize || b.createdAt.getTime() - a.createdAt.getTime(),
      )[0] as LogCheckpoint;
    },
    async insertCheckpoint(v) {
      inserts += 1;
      if (insertDelayMs > 0) await new Promise((r) => setTimeout(r, insertDelayMs));
      const row: LogCheckpoint = {
        id: `cp-${inserts}`,
        treeSize: v.treeSize,
        rootHash: v.rootHash,
        signature: v.signature,
        otsProof: null,
        otsUpgradedAt: null,
        createdAt: v.createdAt,
      };
      checkpoints.push(row);
      return row;
    },
    async setOtsProof(id, proof) {
      const cp = checkpoints.find((c) => c.id === id);
      if (cp) cp.otsProof = proof;
    },
    async applyUpgrade(id, proof, upgradedAt) {
      const cp = checkpoints.find((c) => c.id === id);
      if (cp) {
        cp.otsProof = proof;
        cp.otsUpgradedAt = upgradedAt;
      }
    },
    async unstamped(limit) {
      return checkpoints.filter((c) => c.otsProof === null).slice(0, limit);
    },
    async pendingUpgrade(limit) {
      return checkpoints
        .filter((c) => c.otsProof !== null && c.otsUpgradedAt === null)
        .slice(0, limit);
    },
  };

  return { store, leaves, checkpoints, inserts: () => inserts };
}

/** Deterministic leaf hashes via the production leaf builder. */
function leaf(k: number): string {
  return buildIssuanceLeaf({
    diplomaId: `00000000-0000-4000-8000-00000000000${k}`,
    schoolId: "11111111-1111-4111-8111-111111111111",
    payloadHash: "ab".repeat(32),
    signature: "c2ln",
    issuedAt: "2026-01-01",
  }).leafHashHex;
}

describe("checkpoint.service — sans DB (seams injectées)", () => {
  it("signs the canonical {treeSize, rootHash, timestamp} and produces a valid RFC 6962 root", async () => {
    const root = generateEd25519KeyPair();
    const fake = makeFakeStore([leaf(0), leaf(1), leaf(2)]);
    const at = new Date("2026-07-15T10:00:00.000Z");
    const svc = createCheckpointService({
      store: fake.store,
      ots: null,
      now: () => at,
      signCheckpoint: (p: LogCheckpointPayload) =>
        signEd25519(root.privateKey, Buffer.from(canonicalize(p), "utf8")),
    });

    const cp = await svc.createCheckpoint();
    assert.equal(cp.treeSize, 3);
    // The signature verifies against the canonical form the shared verifier rebuilds.
    const message = Buffer.from(
      canonicalize({ treeSize: cp.treeSize, rootHash: cp.rootHash, timestamp: at.toISOString() }),
      "utf8",
    );
    assert.equal(verifyEd25519(root.publicKey, message, cp.signature), true);

    // The DTO timestamp equals exactly what was signed.
    assert.equal(toLogCheckpointDTO(cp).timestamp, at.toISOString());

    // The root is a genuine RFC 6962 root: an inclusion proof for a leaf checks out.
    const leaves = await svc.snapshotLeaves(cp.treeSize);
    const auditPath = inclusionProofHex(leaves, 1);
    assert.equal(
      verifyInclusion({
        leafHashHex: leaves[1] as string,
        leafIndex: 1,
        treeSize: cp.treeSize,
        auditPathHex: auditPath,
        rootHashHex: cp.rootHash,
      }),
      true,
    );
  });

  it("ensureCheckpointCovering is single-flight: concurrent callers ⇒ ONE insert", async () => {
    const root = generateEd25519KeyPair();
    const fake = makeFakeStore([leaf(0), leaf(1)], 20); // slow insert forces overlap
    const svc = createCheckpointService({
      store: fake.store,
      ots: null,
      now: () => new Date(),
      signCheckpoint: (p) => signEd25519(root.privateKey, Buffer.from(canonicalize(p), "utf8")),
    });

    const [a, b, c] = await Promise.all([
      svc.ensureCheckpointCovering(0),
      svc.ensureCheckpointCovering(0),
      svc.ensureCheckpointCovering(1),
    ]);
    assert.equal(fake.inserts(), 1);
    assert.equal(a.id, b.id);
    assert.equal(b.id, c.id);
    assert.ok(a.treeSize > 1);
  });

  it("maybeCheckpoint is debounced: no second checkpoint within the min interval", async () => {
    const root = generateEd25519KeyPair();
    const fake = makeFakeStore([leaf(0)]);
    let clock = 0;
    const svc = createCheckpointService({
      store: fake.store,
      ots: null,
      now: () => new Date(clock),
      minIntervalMs: 10_000,
      signCheckpoint: (p) => signEd25519(root.privateKey, Buffer.from(canonicalize(p), "utf8")),
    });

    // t=0: tree grew (0 → 1) ⇒ create.
    assert.notEqual(await svc.maybeCheckpoint(), null);
    assert.equal(fake.inserts(), 1);

    // t=5s (< 10s): tree grew again but the debounce swallows it.
    fake.leaves.push(leaf(1));
    clock = 5_000;
    assert.equal(await svc.maybeCheckpoint(), null);
    assert.equal(fake.inserts(), 1);

    // t=15s (> 10s): debounce elapsed ⇒ create.
    clock = 15_000;
    assert.notEqual(await svc.maybeCheckpoint(), null);
    assert.equal(fake.inserts(), 2);

    // No further growth ⇒ null even well past the interval.
    clock = 30_000;
    assert.equal(await svc.maybeCheckpoint(), null);
    assert.equal(fake.inserts(), 2);
  });

  it("runOtsMaintenance stamps then upgrades through the injected OTS client", async () => {
    const root = generateEd25519KeyPair();
    const fake = makeFakeStore([leaf(0)]);
    const fakeOts: OtsAnchorClient = {
      async stamp(digestHex) {
        return Buffer.from(`ots-${digestHex.slice(0, 8)}`, "utf8");
      },
      async upgrade(proof) {
        return { proof, complete: true };
      },
    };
    const at = new Date("2026-07-15T12:00:00.000Z");
    const svc = createCheckpointService({
      store: fake.store,
      ots: fakeOts,
      now: () => at,
      signCheckpoint: (p) => signEd25519(root.privateKey, Buffer.from(canonicalize(p), "utf8")),
    });

    // Seed a proofless checkpoint directly, then let maintenance stamp + upgrade it.
    await fake.store.insertCheckpoint({
      treeSize: 1,
      rootHash: "cd".repeat(32),
      signature: "sig",
      createdAt: at,
    });
    await svc.runOtsMaintenance();

    const cp = fake.checkpoints[0] as LogCheckpoint;
    assert.ok(cp.otsProof !== null, "proof stamped");
    assert.ok(cp.otsUpgradedAt !== null, "proof upgraded (Bitcoin attestation present)");
    const dto = toLogCheckpointDTO(cp);
    assert.equal(dto.otsAnchored, true);
    assert.ok(dto.otsProof !== null);
  });
});
