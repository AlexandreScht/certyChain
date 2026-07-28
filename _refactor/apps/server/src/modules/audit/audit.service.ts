import { and, count, desc, eq } from "drizzle-orm";
import type { VerificationResult } from "@certifychain/contract/enums";
import { db, type DB } from "../../db/client";
import { type AuditEntry, auditLog } from "../../db/schema";
import { logger } from "../../lib/logger";

type AuditType = (typeof auditLog.$inferInsert)["type"];

export interface AuditInput {
  type: AuditType;
  result?: VerificationResult;
  schoolId?: string;
  diplomaId?: string;
  anonymizedSubject?: string;
  ipHash?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append an audit entry. Never throws into the caller's flow.
 *
 * `deps.db` is an injection seam, defaulting to the production `db`: it lets a
 * caller that already runs against an injected database (e.g. `issueDiploma`,
 * whose PQ-degradation entry MUST be observable in tests) write through the
 * same handle instead of the module-level singleton.
 */
export async function recordAudit(
  input: AuditInput,
  deps: { db: DB } = { db },
): Promise<void> {
  try {
    await deps.db.insert(auditLog).values({
      type: input.type,
      result: input.result ?? null,
      schoolId: input.schoolId ?? null,
      diplomaId: input.diplomaId ?? null,
      anonymizedSubject: input.anonymizedSubject ?? null,
      ipHash: input.ipHash ?? null,
      userAgent: input.userAgent ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (e) {
    logger.error("audit.write_failed", { error: String(e), type: input.type });
  }
}

export async function countVerifications(schoolId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(auditLog)
    .where(and(eq(auditLog.schoolId, schoolId), eq(auditLog.type, "verification")));
  return row?.value ?? 0;
}

export async function listSchoolAudit(schoolId: string, limit = 100): Promise<AuditEntry[]> {
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.schoolId, schoolId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
