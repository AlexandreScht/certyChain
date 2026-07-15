import { zValidator } from "../../lib/validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { LogConsistencyQuerySchema } from "@certifychain/contract/schemas";
import type {
  LogCheckpointDTO,
  LogConsistencyDTO,
  TransparencyProofDTO,
} from "@certifychain/contract/dto";
import { RATE_LIMIT } from "../../config/constants";
import { db } from "../../db/client";
import { issuanceLog } from "../../db/schema";
import type { AppEnv } from "../../http/types";
import { fail } from "../../lib/http-error";
import { rateLimit } from "../../middleware/rate-limit";
import { checkpointService, toLogCheckpointDTO } from "./checkpoint.service";
import { consistencyProofHex, inclusionProofHex, merkleRootHex } from "./merkle";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public transparency-log module (v2.md §V3-3): no auth, no cookies, ZERO PII.
 * These routes exist to be AUDITED BY THIRD PARTIES — anyone can pull the signed
 * checkpoint, an inclusion proof for a diploma, or a consistency proof between two
 * tree sizes, and verify them with the shared RFC 6962 implementation (or any CT
 * tool) WITHOUT trusting CertifyChain.
 *
 * Wildcard CORS + cross-origin CORP are granted by the shared public-read
 * predicate (`middleware/security.ts`, same mechanism as the VC discovery
 * artifacts) so auditors can fetch from any origin. Rate-limited per IP.
 */
export const transparencyRoutes = new Hono<AppEnv>()

  .use("*", rateLimit({ key: "transparency", ...RATE_LIMIT.TRANSPARENCY_IP }))

  /**
   * GET /log/checkpoint — the latest Signed Tree Head. Creates one over the current
   * (possibly empty) tree if none exists yet; an empty-tree checkpoint is valid.
   */
  .get("/checkpoint", async (c) => {
    const checkpoint = await checkpointService.getOrCreateCheckpoint();
    const body: LogCheckpointDTO = toLogCheckpointDTO(checkpoint);
    return c.json(body);
  })

  /**
   * GET /log/inclusion/:diplomaId — inclusion proof for one diploma, generated over
   * the leaves TRUNCATED to `checkpoint.treeSize` (never the live tree). A malformed
   * uuid, an unknown id, or a diploma not (yet) logged all fold into the SAME uniform
   * 404 (anti-enumeration, mirror of `/verify/revocation`).
   */
  .get("/inclusion/:diplomaId", async (c) => {
    const diplomaId = c.req.param("diplomaId");
    if (!UUID_RE.test(diplomaId)) throw fail.notFound();

    const [row] = await db
      .select({ leafIndex: issuanceLog.leafIndex, leafHash: issuanceLog.leafHash })
      .from(issuanceLog)
      .where(eq(issuanceLog.diplomaId, diplomaId))
      .limit(1);
    if (!row) throw fail.notFound();

    const leafIndex = Number(row.leafIndex);
    const checkpoint = await checkpointService.ensureCheckpointCovering(leafIndex);
    const leaves = await checkpointService.snapshotLeaves(checkpoint.treeSize);
    const body: TransparencyProofDTO = {
      leafIndex,
      leafHash: row.leafHash,
      auditPath: inclusionProofHex(leaves, leafIndex),
      checkpoint: toLogCheckpointDTO(checkpoint),
    };
    return c.json(body);
  })

  /**
   * GET /log/consistency?from=&to= — RFC 6962 consistency proof between two tree
   * sizes (1 ≤ from ≤ to ≤ current size). Roots are recomputed over the prefixes so a
   * third party can confirm the log is strictly append-only.
   */
  .get("/consistency", zValidator("query", LogConsistencyQuerySchema), async (c) => {
    const { from, to } = c.req.valid("query");
    const size = await checkpointService.currentTreeSize();
    if (to > size) throw fail.validation("to dépasse la taille actuelle du journal");

    const leaves = await checkpointService.snapshotLeaves(to);
    const body: LogConsistencyDTO = {
      fromSize: from,
      toSize: to,
      fromRoot: merkleRootHex(leaves.slice(0, from)),
      toRoot: merkleRootHex(leaves),
      proof: consistencyProofHex(leaves, from),
    };
    return c.json(body);
  });
