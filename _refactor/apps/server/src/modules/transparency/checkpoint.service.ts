import { and, asc, desc, eq, gte, isNotNull, isNull } from "drizzle-orm";
import type { LogCheckpointDTO } from "@certifychain/contract/dto";
import { TRANSPARENCY } from "../../config/constants";
import { env } from "../../config/env";
import { signLogCheckpoint, signLogCheckpointPq, type LogCheckpointPayload } from "../../crypto";
import { db, type DB } from "../../db/client";
import { type LogCheckpoint, logCheckpoints, issuanceLog } from "../../db/schema";
import { fail } from "../../lib/http-error";
import { logger } from "../../lib/logger";
import { merkleRootHex } from "./merkle";

/**
 * Minimal OTS anchoring surface (a structural subset of `OtsClient`), declared
 * HERE on purpose: it keeps the OTS wire-format module (`ots.ts`) OUT of the route
 * type-graph. That module's native-`fetch` Buffer body does not type-check under
 * the client apps' DOM lib (they compile the server sources reachable from
 * `AppType`), so the concrete `createOtsClient` is imported only by server.ts and
 * injected here via `setDefaultOtsClient`.
 */
export interface OtsAnchorClient {
  stamp(digestHex: string): Promise<Buffer | null>;
  upgrade(proof: Buffer): Promise<{ proof: Buffer; complete: boolean }>;
}

let defaultOtsClient: OtsAnchorClient | null = null;

/** Wires the process-wide OTS anchor (called once at startup by server.ts). */
export function setDefaultOtsClient(client: OtsAnchorClient | null): void {
  defaultOtsClient = client;
}

/**
 * Transparency-log checkpoint service (v2.md §V3-1).
 *
 * Keeps an in-memory, append-only cache of the log's leaf hashes and recomputes
 * RFC 6962 roots on the fly. It signs Signed Tree Heads with the PKI root
 * (`signLogCheckpoint`, the exact canonical form the shared browser verifier
 * checks) and submits their roots to OpenTimestamps.
 *
 * All external dependencies — the store (DB by default), the OTS client, the
 * clock, the signer — are INJECTABLE with production defaults (same seam as
 * `KmsSigner.fetchImpl`), so the whole service is testable without a database.
 */

/** Narrow persistence surface the service needs — DB-backed in prod, faked in tests. */
export interface CheckpointStore {
  /** Leaf hashes with `leaf_index >= fromIndex`, ordered ascending. */
  leavesFrom(fromIndex: number): Promise<{ leafIndex: number; leafHash: string }[]>;
  /** The most recent Signed Tree Head (largest tree, newest first), or null. */
  latestCheckpoint(): Promise<LogCheckpoint | null>;
  insertCheckpoint(v: {
    treeSize: number;
    rootHash: string;
    signature: string;
    /** ML-DSA-65 signature of the SAME message (v2.md §V4-1) — null when
     *  `PQ_POLICY === "off"`; never retro-applied to a past checkpoint. */
    signaturePq: string | null;
    createdAt: Date;
  }): Promise<LogCheckpoint>;
  setOtsProof(id: string, proof: Buffer): Promise<void>;
  applyUpgrade(id: string, proof: Buffer, upgradedAt: Date | null): Promise<void>;
  /** Checkpoints still lacking a detached OTS proof (retry stamping). */
  unstamped(limit: number): Promise<LogCheckpoint[]>;
  /** Stamped checkpoints not yet Bitcoin-anchored (retry upgrading). */
  pendingUpgrade(limit: number): Promise<LogCheckpoint[]>;
}

export interface CheckpointServiceDeps {
  db: DB;
  store: CheckpointStore;
  /** Explicit OTS client (tests). Omitted ⇒ the process-wide default (server.ts). */
  ots: OtsAnchorClient | null;
  now: () => Date;
  signCheckpoint: (payload: LogCheckpointPayload) => string;
  /** Explicit PQ checkpoint signer (tests). Omitted ⇒ `env.pqEnabled` decides
   *  (v2.md §V4-1); explicit `null` ⇒ PQ signing disabled regardless of env. */
  signCheckpointPq: ((payload: LogCheckpointPayload) => string) | null;
  minIntervalMs: number;
}

/** Maps a checkpoint row to its public DTO. `otsAnchored` turns true ONLY once the
    proof carries a Bitcoin attestation (never claim "anchored" before, v2.md §V3-5). */
export function toLogCheckpointDTO(row: LogCheckpoint): LogCheckpointDTO {
  return {
    treeSize: row.treeSize,
    rootHash: row.rootHash,
    // `created_at` IS the signed timestamp (stored explicitly at creation).
    timestamp: row.createdAt.toISOString(),
    signature: row.signature,
    ...(row.signaturePq ? { signaturePq: row.signaturePq } : {}),
    otsAnchored: row.otsUpgradedAt !== null,
    otsUpgradedAt: row.otsUpgradedAt ? row.otsUpgradedAt.toISOString() : null,
    // Buffer.from guards against the driver surfacing bytea as a plain Uint8Array.
    otsProof: row.otsProof ? Buffer.from(row.otsProof).toString("base64") : null,
  };
}

/** DB-backed store (production default). */
function dbCheckpointStore(database: DB): CheckpointStore {
  return {
    leavesFrom(fromIndex) {
      return database
        .select({ leafIndex: issuanceLog.leafIndex, leafHash: issuanceLog.leafHash })
        .from(issuanceLog)
        .where(gte(issuanceLog.leafIndex, fromIndex))
        .orderBy(asc(issuanceLog.leafIndex));
    },
    async latestCheckpoint() {
      const [row] = await database
        .select()
        .from(logCheckpoints)
        .orderBy(desc(logCheckpoints.treeSize), desc(logCheckpoints.createdAt))
        .limit(1);
      return row ?? null;
    },
    async insertCheckpoint(v) {
      const [row] = await database
        .insert(logCheckpoints)
        .values({
          treeSize: v.treeSize,
          rootHash: v.rootHash,
          signature: v.signature,
          signaturePq: v.signaturePq,
          createdAt: v.createdAt,
        })
        .returning();
      if (!row) throw fail.internal();
      return row;
    },
    async setOtsProof(id, proof) {
      await database.update(logCheckpoints).set({ otsProof: proof }).where(eq(logCheckpoints.id, id));
    },
    async applyUpgrade(id, proof, upgradedAt) {
      await database
        .update(logCheckpoints)
        .set({ otsProof: proof, otsUpgradedAt: upgradedAt })
        .where(eq(logCheckpoints.id, id));
    },
    unstamped(limit) {
      return database
        .select()
        .from(logCheckpoints)
        .where(isNull(logCheckpoints.otsProof))
        .limit(limit);
    },
    pendingUpgrade(limit) {
      return database
        .select()
        .from(logCheckpoints)
        .where(and(isNotNull(logCheckpoints.otsProof), isNull(logCheckpoints.otsUpgradedAt)))
        .limit(limit);
    },
  };
}

export type CheckpointService = ReturnType<typeof createCheckpointService>;

export function createCheckpointService(overrides: Partial<CheckpointServiceDeps> = {}) {
  const database = overrides.db ?? db;
  const store = overrides.store ?? dbCheckpointStore(database);
  const now = overrides.now ?? (() => new Date());
  const signCheckpoint = overrides.signCheckpoint ?? ((p: LogCheckpointPayload) => signLogCheckpoint(p));
  // v2.md §V4-1: PQ checkpoint signing follows `env.pqEnabled` unless a test
  // explicitly overrides it (including explicit `null` to force it off).
  const signCheckpointPq =
    overrides.signCheckpointPq !== undefined
      ? overrides.signCheckpointPq
      : env.pqEnabled
        ? (p: LogCheckpointPayload) => signLogCheckpointPq(p)
        : null;
  const minIntervalMs = overrides.minIntervalMs ?? TRANSPARENCY.CHECKPOINT_MIN_INTERVAL_SEC * 1000;
  // `undefined` ⇒ use the process-wide default (wired at startup); explicit `null`
  // ⇒ anchoring disabled (tests). Resolved lazily so a late `setDefaultOtsClient`
  // (server startup, after this singleton is built) still takes effect.
  const explicitOts = overrides.ots;
  const resolveOts = (): OtsAnchorClient | null =>
    explicitOts !== undefined ? explicitOts : defaultOtsClient;

  // Append-only cache: index === leaf position. Commits are serialized by the
  // issuance advisory lock, so a read of `leaf_index >= cache.length` returns a
  // contiguous run (design D1) — the cache is never invalidated, only extended.
  const leafCache: string[] = [];
  let creating: Promise<LogCheckpoint> | null = null;
  // -∞ so the FIRST checkpoint is never debounced (matters under an injected clock
  // starting at 0; in prod the real clock is already far past 0 anyway).
  let lastCreatedMs = Number.NEGATIVE_INFINITY;

  async function refresh(): Promise<void> {
    const rows = await store.leavesFrom(leafCache.length);
    for (const row of rows) {
      // Defensive: only append on strict contiguity (should always hold).
      if (Number(row.leafIndex) !== leafCache.length) break;
      leafCache.push(row.leafHash);
    }
  }

  async function currentTreeSize(): Promise<number> {
    await refresh();
    return leafCache.length;
  }

  /** First `treeSize` leaf hashes — exactly the leaves a checkpoint at that size
   *  committed to (append-only ⇒ the prefix is immutable). */
  async function snapshotLeaves(treeSize: number): Promise<string[]> {
    await refresh();
    return leafCache.slice(0, treeSize);
  }

  async function stampCheckpoint(id: string, rootHash: string): Promise<void> {
    const ots = resolveOts();
    if (!ots) return;
    const proof = await ots.stamp(rootHash);
    if (proof) await store.setOtsProof(id, proof);
  }

  async function createCheckpoint(): Promise<LogCheckpoint> {
    await refresh();
    const treeSize = leafCache.length;
    const rootHash = merkleRootHex(leafCache); // empty tree ⇒ SHA-256("")
    const at = now();
    const timestamp = at.toISOString();
    const signature = signCheckpoint({ treeSize, rootHash, timestamp });
    const signaturePq = signCheckpointPq ? signCheckpointPq({ treeSize, rootHash, timestamp }) : null;
    const row = await store.insertCheckpoint({ treeSize, rootHash, signature, signaturePq, createdAt: at });
    lastCreatedMs = at.getTime();
    // Anchoring is best-effort and never blocks (v2.md §V3-5): fire-and-forget.
    if (resolveOts()) {
      void stampCheckpoint(row.id, rootHash).catch((e) =>
        logger.error("transparency.stamp_failed", { error: String(e), checkpointId: row.id }),
      );
    }
    return row;
  }

  /** Single-flight: concurrent callers share ONE creation. */
  function createSingleFlight(): Promise<LogCheckpoint> {
    if (creating) return creating;
    creating = (async () => {
      try {
        return await createCheckpoint();
      } finally {
        creating = null;
      }
    })();
    return creating;
  }

  async function getLatestCheckpoint(): Promise<LogCheckpoint | null> {
    return store.latestCheckpoint();
  }

  /** Latest STH, creating one over the current (possibly empty) tree if none exists. */
  async function getOrCreateCheckpoint(): Promise<LogCheckpoint> {
    const latest = await store.latestCheckpoint();
    return latest ?? createSingleFlight();
  }

  /** A signed checkpoint whose tree INCLUDES `leafIndex`. Coverage-first (a bundle
   *  must prove inclusion against a covering tree), so it is single-flight but not
   *  blocked by the debounce. The caller guarantees the leaf is already committed. */
  async function ensureCheckpointCovering(leafIndex: number): Promise<LogCheckpoint> {
    const latest = await store.latestCheckpoint();
    if (latest && latest.treeSize > leafIndex) return latest;
    let cp = await createSingleFlight();
    // An in-flight creation may have snapshotted just before our leaf committed;
    // one more pass (fresh single-flight) then includes it.
    if (cp.treeSize <= leafIndex) cp = await createSingleFlight();
    return cp;
  }

  /** Hourly cron: sign a fresh checkpoint only if the tree grew AND the debounce
   *  window elapsed (bounds checkpoint spam, design D3). */
  async function maybeCheckpoint(): Promise<LogCheckpoint | null> {
    const size = await currentTreeSize();
    const latest = await store.latestCheckpoint();
    if (latest && latest.treeSize >= size) return null; // no growth
    if (now().getTime() - lastCreatedMs < minIntervalMs) return null; // debounced
    return createSingleFlight();
  }

  /** OTS maintenance cron: retry stamping proofless checkpoints, then try to graft
   *  a Bitcoin attestation onto stamped-but-unanchored ones. Bounded per pass. */
  async function runOtsMaintenance(): Promise<void> {
    const ots = resolveOts();
    if (!ots) return;
    for (const cp of await store.unstamped(TRANSPARENCY.OTS_BATCH)) {
      const proof = await ots.stamp(cp.rootHash);
      if (proof) await store.setOtsProof(cp.id, proof);
    }
    for (const cp of await store.pendingUpgrade(TRANSPARENCY.OTS_BATCH)) {
      if (!cp.otsProof) continue;
      // Buffer.from: tolerate a driver that returns bytea as a plain Uint8Array.
      const { proof, complete } = await ots.upgrade(Buffer.from(cp.otsProof));
      await store.applyUpgrade(cp.id, proof, complete ? now() : null);
    }
  }

  return {
    getLatestCheckpoint,
    getOrCreateCheckpoint,
    createCheckpoint,
    ensureCheckpointCovering,
    maybeCheckpoint,
    runOtsMaintenance,
    snapshotLeaves,
    currentTreeSize,
  };
}

/** Process-wide singleton (shared cache across routes + jobs). */
export const checkpointService = createCheckpointService();

/**
 * Scheduled transparency work, started next to `startCleanupJob()` (server.ts):
 *  - hourly: a fresh signed checkpoint when the tree grew;
 *  - every 30 min (only when OTS is configured): retry stamp + upgrade.
 * In-process unref'd timers — same single-instance MVP contract as cleanup.ts.
 */
export function startTransparencyJobs(): void {
  const runCron = (): void => {
    checkpointService
      .maybeCheckpoint()
      .catch((e) => logger.error("transparency.checkpoint_cron_failed", { error: String(e) }));
  };
  runCron();
  setInterval(runCron, TRANSPARENCY.CHECKPOINT_CRON_MS).unref();

  if (env.otsEnabled) {
    const runOts = (): void => {
      checkpointService
        .runOtsMaintenance()
        .catch((e) => logger.error("transparency.ots_cron_failed", { error: String(e) }));
    };
    setInterval(runOts, TRANSPARENCY.OTS_JOB_INTERVAL_MS).unref();
  }
}
