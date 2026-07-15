import { count, eq, sql } from "drizzle-orm";
import type { SchoolDTO, SchoolStatsDTO } from "@certifychain/contract/dto";
import { env } from "../../config/env";
import { issueSchoolCertificate, signerFor } from "../../crypto";
import { db } from "../../db/client";
import { type School, diplomas, schoolAdmins, schools } from "../../db/schema";
import { fail } from "../../lib/http-error";
import { countVerifications, recordAudit } from "../audit/audit.service";
import { clearVcStatusCache } from "../vc/vc.service";

/** Build the public-facing school DTO (never exposes keys). */
export function toSchoolDTO(school: School): SchoolDTO {
  return {
    id: school.id,
    name: school.name,
    status: school.status,
    contactEmail: school.contactEmail,
    hasKeys: school.publicKey != null && school.certificate != null,
    createdAt: school.createdAt.toISOString(),
    approvedAt: school.approvedAt ? school.approvedAt.toISOString() : null,
  };
}

/** Aggregate issuance + verification stats for a school. */
export async function getSchoolStats(schoolId: string): Promise<SchoolStatsDTO> {
  const [counts] = await db
    .select({
      total: count(),
      active: count(sql`case when ${diplomas.status} = 'active' then 1 end`),
      revoked: count(sql`case when ${diplomas.status} = 'revoked' then 1 end`),
      lastIssuedAt: sql<string | null>`max(${diplomas.createdAt})`,
    })
    .from(diplomas)
    .where(eq(diplomas.schoolId, schoolId));

  const verifications = await countVerifications(schoolId);
  const lastIssuedAt = counts?.lastIssuedAt ?? null;

  return {
    totalDiplomas: counts?.total ?? 0,
    activeDiplomas: counts?.active ?? 0,
    revokedDiplomas: counts?.revoked ?? 0,
    verifications,
    lastIssuedAt: lastIssuedAt ? new Date(lastIssuedAt).toISOString() : null,
  };
}

/** True if a school_admin already exists with this email (case-insensitive). */
export async function schoolAdminExists(email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schoolAdmins.id })
    .from(schoolAdmins)
    .where(eq(sql`lower(${schoolAdmins.email})`, email.toLowerCase()))
    .limit(1);
  return row != null;
}

/** True if a school is already registered with this SIRET (unique establishment). */
export async function schoolWithSiretExists(siret: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schools.id })
    .from(schools)
    .where(eq(schools.siret, siret))
    .limit(1);
  return row != null;
}

/** Load a school row by id, or null. */
export async function getSchoolById(schoolId: string): Promise<School | null> {
  const [row] = await db.select().from(schools).where(eq(schools.id, schoolId)).limit(1);
  return row ?? null;
}

/** Today as YYYY-MM-DD (UTC) for certificate issuance dates. */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Local SIRET sanity check (14 digits + Luhn). A signal for AI/manual review. */
export function siretLuhnValid(siret: string | null | undefined): boolean {
  if (!siret || !/^\d{14}$/.test(siret)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    let d = siret.charCodeAt(13 - i) - 48;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * Marks a school `provisional`: its EXISTENCE is confirmed (SIRENE/AI **or** an
 * admin decision), but OWNERSHIP is not yet proven (verify.md). A provisional
 * school can sign in and explore, but holds NO PKI keys and therefore cannot emit
 * diplomas — it must complete a control proof (DNS / postal / ProConnect) to reach
 * `approved`. This is the SINGLE path used by both the AI auto-validation gate and
 * the admin "validate existence" action: neither issues keys (only a control proof
 * does, via approveSchool). Reachable from `pending` (normal) or from a prior
 * `rejected`/`revoked` decision an admin overturns. Never downgrades an already
 * `approved` school; no-op if already `provisional`.
 */
export async function markSchoolProvisional(
  schoolId: string,
  opts: { autoValidated?: boolean; reviewedByAdminId?: string } = {},
): Promise<School | null> {
  const school = await getSchoolById(schoolId);
  if (!school) throw fail.notFound("Établissement introuvable");
  // Never downgrade an approved school (use revoke); no-op if already provisional.
  if (school.status === "approved" || school.status === "provisional") return school;

  const [updated] = await db
    .update(schools)
    .set({
      status: "provisional",
      autoValidated: opts.autoValidated ?? school.autoValidated,
      validatedAt: school.validatedAt ?? new Date(),
      statusReason: null,
      ...(opts.reviewedByAdminId
        ? { reviewedByAdminId: opts.reviewedByAdminId, reviewedAt: new Date() }
        : {}),
    })
    .where(eq(schools.id, schoolId))
    .returning();
  if (!updated) throw fail.internal();
  await recordAudit({
    type: "school_provisional",
    schoolId,
    metadata: { autoValidated: opts.autoValidated ?? false, by: opts.reviewedByAdminId ? "admin" : "auto" },
  });
  return updated;
}

/**
 * Approves a school and provisions its issuer PKI material: generates an Ed25519
 * key pair, root-signs its certificate, flips status to `approved`. Idempotent
 * (re-approving a school that already has keys just refreshes the review fields).
 *
 * This is the production-grade approval path used by the admin portal AND the AI
 * auto-validation gate — it replaces the dev-only `/schools/me/activate` (B1).
 */
export async function approveSchool(
  schoolId: string,
  opts: { autoValidated?: boolean; reviewedByAdminId?: string } = {},
): Promise<School> {
  const school = await getSchoolById(schoolId);
  if (!school) throw fail.notFound("Établissement introuvable");

  const now = new Date();
  const hasKeys = school.publicKey != null && school.certificate != null;

  const base = {
    status: "approved" as const,
    autoValidated: opts.autoValidated ?? school.autoValidated,
    reviewedByAdminId: opts.reviewedByAdminId ?? school.reviewedByAdminId,
    reviewedAt: now,
    statusReason: null,
  };

  if (hasKeys) {
    const [updated] = await db
      .update(schools)
      .set({ ...base, approvedAt: school.approvedAt ?? now })
      .where(eq(schools.id, schoolId))
      .returning();
    if (!updated) throw fail.internal();
    clearVcStatusCache();
    return updated;
  }

  // Mint the issuer key through the Signer seam (v2.md §V2-1): the private key
  // never surfaces here — we only get the public key (to certify + publish) and an
  // opaque `ref` to persist. The backend is the deployment default (env.SIGNER_KIND).
  const signer = signerFor(env.SIGNER_KIND);
  const { publicKeyPem, ref } = await signer.createSchoolKey(schoolId);
  // Single instant for the signed cert `issuedAt` and the stored `approvedAt`
  // so verify re-derives the exact signed date (audit #15).
  const certificate = issueSchoolCertificate({
    schoolId,
    publicKey: publicKeyPem,
    name: school.name,
    issuedAt: now.toISOString().slice(0, 10),
  });

  const [updated] = await db
    .update(schools)
    .set({
      ...base,
      approvedAt: now,
      publicKey: publicKeyPem,
      certificate,
      signerKind: signer.kind,
      signerRef: ref,
    })
    .where(eq(schools.id, schoolId))
    .returning();
  if (!updated) throw fail.internal();
  clearVcStatusCache();
  return updated;
}
