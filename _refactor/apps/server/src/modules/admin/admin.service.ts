import { and, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type {
  AdminAuditEntryDTO,
  AdminSchoolDetailDTO,
  AdminSchoolListDTO,
  AdminStatsDTO,
  DiplomaListDTO,
} from "@certifychain/contract/dto";
import type {
  AdminDiplomasQuery,
  ListAuditQuery,
  ReviewSchoolsQuery,
} from "@certifychain/contract/schemas";
import { db } from "../../db/client";
import {
  type AuditEntry,
  auditLog,
  auditTypeEnum,
  diplomas,
  refreshSessions,
  schoolAdmins,
  schools,
  students,
} from "../../db/schema";
import { fail } from "../../lib/http-error";
import { recordAudit } from "../audit/audit.service";
import { toDiplomaDTO } from "../diplomas/diplomas.service";
import { getSchoolById, getSchoolStats, toSchoolDTO } from "../schools/schools.service";

function toAdminAuditDTO(entry: AuditEntry, schoolName: string | null): AdminAuditEntryDTO {
  return {
    id: entry.id,
    type: entry.type,
    result: entry.result ?? null,
    schoolId: entry.schoolId ?? null,
    schoolName,
    diplomaId: entry.diplomaId ?? null,
    createdAt: entry.createdAt.toISOString(),
    metadata: (entry.metadata as Record<string, unknown> | null) ?? null,
  };
}

/* ── Global stats ─────────────────────────────────────────────────────────── */

export async function getGlobalStats(): Promise<AdminStatsDTO> {
  const [schoolCounts] = await db
    .select({
      total: count(),
      pending: count(sql`case when ${schools.status} = 'pending' then 1 end`),
      provisional: count(sql`case when ${schools.status} = 'provisional' then 1 end`),
      approved: count(sql`case when ${schools.status} = 'approved' then 1 end`),
      rejected: count(sql`case when ${schools.status} = 'rejected' then 1 end`),
      revoked: count(sql`case when ${schools.status} = 'revoked' then 1 end`),
    })
    .from(schools);

  const [diplomaCounts] = await db
    .select({
      total: count(),
      active: count(sql`case when ${diplomas.status} = 'active' then 1 end`),
      revoked: count(sql`case when ${diplomas.status} = 'revoked' then 1 end`),
    })
    .from(diplomas);

  const [studentCount] = await db.select({ value: count() }).from(students);
  const [verifCount] = await db
    .select({ value: count() })
    .from(auditLog)
    .where(eq(auditLog.type, "verification"));

  const recent = await db
    .select({ entry: auditLog, schoolName: schools.name })
    .from(auditLog)
    .leftJoin(schools, eq(auditLog.schoolId, schools.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(12);

  return {
    schools: {
      total: schoolCounts?.total ?? 0,
      pending: schoolCounts?.pending ?? 0,
      provisional: schoolCounts?.provisional ?? 0,
      approved: schoolCounts?.approved ?? 0,
      rejected: schoolCounts?.rejected ?? 0,
      revoked: schoolCounts?.revoked ?? 0,
    },
    diplomas: {
      total: diplomaCounts?.total ?? 0,
      active: diplomaCounts?.active ?? 0,
      revoked: diplomaCounts?.revoked ?? 0,
    },
    students: studentCount?.value ?? 0,
    verifications: verifCount?.value ?? 0,
    recentActivity: recent.map((r) => toAdminAuditDTO(r.entry, r.schoolName)),
  };
}

/* ── Schools list + detail ────────────────────────────────────────────────── */

export async function listSchoolsForAdmin(q: ReviewSchoolsQuery): Promise<AdminSchoolListDTO> {
  const conds = [];
  if (q.status) conds.push(eq(schools.status, q.status));
  if (q.q) {
    const pattern = `%${q.q}%`;
    conds.push(or(ilike(schools.name, pattern), ilike(schools.siret, pattern)));
  }
  const where = conds.length ? and(...conds) : undefined;

  const [totalRow] = await db.select({ value: count() }).from(schools).where(where);
  const total = totalRow?.value ?? 0;

  const rows = await db
    .select()
    .from(schools)
    .where(where)
    .orderBy(desc(schools.createdAt))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);

  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? await db
        .select({ schoolId: diplomas.schoolId, value: count() })
        .from(diplomas)
        .where(inArray(diplomas.schoolId, ids))
        .groupBy(diplomas.schoolId)
    : [];
  const countMap = new Map(counts.map((c) => [c.schoolId, c.value]));

  return {
    items: rows.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      siret: s.siret,
      contactEmail: s.contactEmail,
      validationScore: s.validationScore,
      autoValidated: s.autoValidated,
      sireneVerified: s.sireneVerified,
      diplomaCount: countMap.get(s.id) ?? 0,
      createdAt: s.createdAt.toISOString(),
      approvedAt: s.approvedAt ? s.approvedAt.toISOString() : null,
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  };
}

export async function getSchoolDetailForAdmin(id: string): Promise<AdminSchoolDetailDTO> {
  const school = await getSchoolById(id);
  if (!school) throw fail.notFound("Établissement introuvable");

  const admins = await db.select().from(schoolAdmins).where(eq(schoolAdmins.schoolId, id));
  const stats = await getSchoolStats(id);
  const recentAudit = await db
    .select({ entry: auditLog, schoolName: schools.name })
    .from(auditLog)
    .leftJoin(schools, eq(auditLog.schoolId, schools.id))
    .where(eq(auditLog.schoolId, id))
    .orderBy(desc(auditLog.createdAt))
    .limit(20);

  return {
    id: school.id,
    name: school.name,
    status: school.status,
    siret: school.siret,
    uai: school.uai,
    city: school.city,
    verifiedOfficialDomain: school.verifiedOfficialDomain,
    contactEmail: school.contactEmail,
    hasKeys: toSchoolDTO(school).hasKeys,
    validationScore: school.validationScore,
    validationReasoning: school.validationReasoning,
    validationModel: school.validationModel,
    validatedAt: school.validatedAt ? school.validatedAt.toISOString() : null,
    autoValidated: school.autoValidated,
    sireneVerified: school.sireneVerified,
    sireneLegalName: school.sireneLegalName,
    validationSignals: school.validationSignals ?? null,
    statusReason: school.statusReason,
    createdAt: school.createdAt.toISOString(),
    approvedAt: school.approvedAt ? school.approvedAt.toISOString() : null,
    reviewedAt: school.reviewedAt ? school.reviewedAt.toISOString() : null,
    admins: admins.map((a) => ({
      id: a.id,
      email: a.email,
      fullName: a.fullName,
      lastLoginAt: a.lastLoginAt ? a.lastLoginAt.toISOString() : null,
    })),
    stats,
    recentAudit: recentAudit.map((r) => toAdminAuditDTO(r.entry, r.schoolName)),
  };
}

/* ── School lifecycle actions (reject / revoke) ───────────────────────────── */

/**
 * Revokes every live refresh session held by a school's admins. Called when a
 * school is rejected/revoked so its admins cannot keep rotating a live session
 * after losing platform access. The short-lived access token still expires on
 * its own TTL; this shuts the renewal path immediately (mirrors the status gate
 * added to POST /auth/refresh).
 */
async function revokeSchoolAdminSessions(schoolId: string): Promise<void> {
  const admins = await db
    .select({ id: schoolAdmins.id })
    .from(schoolAdmins)
    .where(eq(schoolAdmins.schoolId, schoolId));
  if (admins.length === 0) return;
  await db
    .update(refreshSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshSessions.subjectType, "school_admin"),
        inArray(
          refreshSessions.subjectId,
          admins.map((a) => a.id),
        ),
        isNull(refreshSessions.revokedAt),
      ),
    );
}

export async function rejectSchool(id: string, reason: string, adminId: string): Promise<void> {
  const school = await getSchoolById(id);
  if (!school) throw fail.notFound("Établissement introuvable");

  await db
    .update(schools)
    .set({ status: "rejected", statusReason: reason, reviewedByAdminId: adminId, reviewedAt: new Date() })
    .where(eq(schools.id, id));
  await revokeSchoolAdminSessions(id);
  await recordAudit({ type: "school_rejected", schoolId: id, metadata: { reason } });
}

export async function revokeSchool(id: string, reason: string, adminId: string): Promise<void> {
  const school = await getSchoolById(id);
  if (!school) throw fail.notFound("Établissement introuvable");

  await db
    .update(schools)
    .set({ status: "revoked", statusReason: reason, reviewedByAdminId: adminId, reviewedAt: new Date() })
    .where(eq(schools.id, id));
  await revokeSchoolAdminSessions(id);
  await recordAudit({ type: "school_revoked", schoolId: id, metadata: { reason } });
}

/* ── Global diplomas oversight (read-only) ────────────────────────────────── */

export async function listDiplomasGlobal(q: AdminDiplomasQuery): Promise<DiplomaListDTO> {
  const conds = [];
  if (q.status) conds.push(eq(diplomas.status, q.status));
  if (q.schoolId) conds.push(eq(diplomas.schoolId, q.schoolId));
  if (q.year) conds.push(sql`extract(year from ${diplomas.issuedAt}) = ${q.year}`);
  if (q.q) {
    const pattern = `%${q.q}%`;
    conds.push(or(ilike(diplomas.holderName, pattern), ilike(diplomas.programTitle, pattern)));
  }
  const where = conds.length ? and(...conds) : undefined;

  const [totalRow] = await db.select({ value: count() }).from(diplomas).where(where);
  const total = totalRow?.value ?? 0;

  const rows = await db
    .select({ diploma: diplomas, schoolName: schools.name })
    .from(diplomas)
    .innerJoin(schools, eq(diplomas.schoolId, schools.id))
    .where(where)
    .orderBy(desc(diplomas.createdAt))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);

  return {
    items: rows.map((r) => toDiplomaDTO(r.diploma, r.schoolName)),
    total,
    page: q.page,
    pageSize: q.pageSize,
  };
}

/* ── Global audit log ─────────────────────────────────────────────────────── */

export interface AdminAuditListDTO {
  items: AdminAuditEntryDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listAuditGlobal(q: ListAuditQuery): Promise<AdminAuditListDTO> {
  // Free-form filter guarded against the enum: an unknown value would otherwise
  // raise a Postgres "invalid input value for enum" → 500 instead of a clean 422.
  if (q.type && !(auditTypeEnum.enumValues as readonly string[]).includes(q.type)) {
    throw fail.validation("Type d'événement inconnu");
  }
  const where = q.type ? sql`${auditLog.type} = ${q.type}` : undefined;

  const [totalRow] = await db.select({ value: count() }).from(auditLog).where(where);
  const total = totalRow?.value ?? 0;

  const rows = await db
    .select({ entry: auditLog, schoolName: schools.name })
    .from(auditLog)
    .leftJoin(schools, eq(auditLog.schoolId, schools.id))
    .where(where)
    .orderBy(desc(auditLog.createdAt))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);

  return {
    items: rows.map((r) => toAdminAuditDTO(r.entry, r.schoolName)),
    total,
    page: q.page,
    pageSize: q.pageSize,
  };
}
