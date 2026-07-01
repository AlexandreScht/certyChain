import { and, desc, eq } from "drizzle-orm";
import type { ShareLinkDTO, WalletDiplomaDTO } from "../../contract/dto";
import { db } from "../../db/client";
import { diplomas, schools, shareLinks } from "../../db/schema";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3000";

interface WalletDiplomaRow {
  id: string;
  schoolName: string;
  programTitle: string;
  mention: string | null;
  rncp: string | null;
  issuedAt: string;
  status: WalletDiplomaDTO["status"];
}

/** Map a joined diploma row to the wallet DTO. */
export function toWalletDiplomaDTO(row: WalletDiplomaRow): WalletDiplomaDTO {
  return {
    id: row.id,
    schoolName: row.schoolName,
    programTitle: row.programTitle,
    mention: row.mention,
    rncp: row.rncp,
    issuedAt: row.issuedAt,
    status: row.status,
  };
}

/** Map a share_links row to the public ShareLink DTO. */
export function toShareLinkDTO(row: typeof shareLinks.$inferSelect): ShareLinkDTO {
  return {
    token: row.token,
    url: `${WEB_ORIGIN}/verify/${row.token}`,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    revoked: row.revoked,
    createdAt: row.createdAt.toISOString(),
  };
}

/** List the diplomas owned by a student, newest first (joined with school name). */
export async function listStudentDiplomas(studentId: string): Promise<WalletDiplomaDTO[]> {
  const rows = await db
    .select({
      id: diplomas.id,
      schoolName: schools.name,
      programTitle: diplomas.programTitle,
      mention: diplomas.mention,
      rncp: diplomas.rncp,
      issuedAt: diplomas.issuedAt,
      status: diplomas.status,
    })
    .from(diplomas)
    .innerJoin(schools, eq(diplomas.schoolId, schools.id))
    .where(eq(diplomas.studentId, studentId))
    .orderBy(desc(diplomas.issuedAt));
  return rows.map(toWalletDiplomaDTO);
}

/** Fetch a diploma owned by the student (joined with school name), or null. */
export async function getStudentDiploma(
  diplomaId: string,
  studentId: string,
): Promise<WalletDiplomaDTO | null> {
  const [row] = await db
    .select({
      id: diplomas.id,
      schoolName: schools.name,
      programTitle: diplomas.programTitle,
      mention: diplomas.mention,
      rncp: diplomas.rncp,
      issuedAt: diplomas.issuedAt,
      status: diplomas.status,
    })
    .from(diplomas)
    .innerJoin(schools, eq(diplomas.schoolId, schools.id))
    .where(and(eq(diplomas.id, diplomaId), eq(diplomas.studentId, studentId)))
    .limit(1);
  return row ? toWalletDiplomaDTO(row) : null;
}

/** True iff the diploma exists and is owned by the student. */
export async function ownsDiploma(diplomaId: string, studentId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: diplomas.id })
    .from(diplomas)
    .where(and(eq(diplomas.id, diplomaId), eq(diplomas.studentId, studentId)))
    .limit(1);
  return Boolean(row);
}
