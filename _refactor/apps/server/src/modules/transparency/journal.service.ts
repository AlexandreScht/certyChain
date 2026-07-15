import { and, count, desc, eq } from "drizzle-orm";
import type {
  ReportJournalResultDTO,
  SchoolJournalDTO,
  SchoolJournalEntryDTO,
} from "@certifychain/contract/dto";
import type { ListJournalQuery } from "@certifychain/contract/schemas";
import { env } from "../../config/env";
import { db } from "../../db/client";
import { diplomas, issuanceLog, schools } from "../../db/schema";
import { fail } from "../../lib/http-error";
import { logger } from "../../lib/logger";
import { sendJournalReportNotification } from "../../lib/mailer";
import { recordAudit } from "../audit/audit.service";

/**
 * School-facing transparency journal (v2.md §V3-6). Unlike the PUBLIC log leaf
 * (PII-free by construction), this is the authenticated portal of the school over
 * ITS OWN diplomas, so returning the holder name / program is fine.
 */
export async function getSchoolJournal(
  schoolId: string,
  q: ListJournalQuery,
): Promise<SchoolJournalDTO> {
  const [school] = await db
    .select({ frozen: schools.issuanceFrozenAt })
    .from(schools)
    .where(eq(schools.id, schoolId))
    .limit(1);

  const [totalRow] = await db
    .select({ value: count() })
    .from(issuanceLog)
    .innerJoin(diplomas, eq(issuanceLog.diplomaId, diplomas.id))
    .where(eq(diplomas.schoolId, schoolId));
  const total = totalRow?.value ?? 0;

  const rows = await db
    .select({
      leafIndex: issuanceLog.leafIndex,
      diplomaId: issuanceLog.diplomaId,
      holderName: diplomas.holderName,
      programTitle: diplomas.programTitle,
      issuedAt: diplomas.issuedAt,
      loggedAt: issuanceLog.createdAt,
      reportedAt: issuanceLog.reportedAt,
    })
    .from(issuanceLog)
    .innerJoin(diplomas, eq(issuanceLog.diplomaId, diplomas.id))
    .where(eq(diplomas.schoolId, schoolId))
    .orderBy(desc(issuanceLog.leafIndex))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);

  const items: SchoolJournalEntryDTO[] = rows.map((r) => ({
    leafIndex: r.leafIndex,
    diplomaId: r.diplomaId,
    holderName: r.holderName,
    programTitle: r.programTitle,
    issuedAt: r.issuedAt,
    loggedAt: r.loggedAt.toISOString(),
    reportedAt: r.reportedAt ? r.reportedAt.toISOString() : null,
  }));

  return {
    items,
    total,
    page: q.page,
    pageSize: q.pageSize,
    issuanceFrozenAt: school?.frozen ? school.frozen.toISOString() : null,
  };
}

/**
 * Flags a logged issuance the school did not make (v2.md §V3-6): marks the leaf
 * reported, FREEZES the school (further issuance blocked; existing diplomas keep
 * verifying), audits it, and alerts a platform admin. Idempotent — re-reporting an
 * already-flagged entry is a clean no-op that returns the current frozen state.
 */
export async function reportJournalEntry(
  schoolId: string,
  diplomaId: string,
  reason: string | undefined,
): Promise<ReportJournalResultDTO> {
  // The entry must belong to THIS school (join through diplomas).
  const [entry] = await db
    .select({ leafIndex: issuanceLog.leafIndex, reportedAt: issuanceLog.reportedAt })
    .from(issuanceLog)
    .innerJoin(diplomas, eq(issuanceLog.diplomaId, diplomas.id))
    .where(and(eq(issuanceLog.diplomaId, diplomaId), eq(diplomas.schoolId, schoolId)))
    .limit(1);
  if (!entry) throw fail.notFound();

  const [school] = await db.select().from(schools).where(eq(schools.id, schoolId)).limit(1);
  if (!school) throw fail.notFound();

  // Already flagged (or already frozen): no re-freeze, no duplicate alert.
  if (entry.reportedAt) {
    const frozenAt = school.issuanceFrozenAt ?? entry.reportedAt;
    return { ok: true, issuanceFrozenAt: frozenAt.toISOString() };
  }

  const now = new Date();
  await db
    .update(issuanceLog)
    .set({ reportedAt: now, reportedReason: reason ?? null })
    .where(eq(issuanceLog.diplomaId, diplomaId));

  // Keep the ORIGINAL freeze time if the school was already frozen by a prior report.
  const frozenAt = school.issuanceFrozenAt ?? now;
  if (!school.issuanceFrozenAt) {
    await db.update(schools).set({ issuanceFrozenAt: now }).where(eq(schools.id, schoolId));
  }

  await recordAudit({
    type: "transparency_report",
    schoolId,
    diplomaId,
    metadata: { leafIndex: entry.leafIndex, reason: reason ?? null },
  });

  void sendJournalReportNotification(env.ADMIN_NOTIFY_EMAIL, {
    schoolName: school.name,
    diplomaId,
    reason: reason ?? null,
    adminUrl: `${env.ADMIN_ORIGIN}/schools/${schoolId}`,
  }).catch((e) => logger.error("journal.report_notify_failed", { error: String(e), schoolId }));

  return { ok: true, issuanceFrozenAt: frozenAt.toISOString() };
}
