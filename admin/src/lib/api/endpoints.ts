import { get, post, put } from "./client";

import type {
  AdminLoginInput,
  AdminDiplomasQuery,
  ListAuditQuery,
  ReviewSchoolsQuery,
  UpdateSettingsInput,
} from "@contract/schemas";
import type {
  AdminAuditEntryDTO,
  AdminSchoolDetailDTO,
  AdminSchoolListDTO,
  AdminSessionDTO,
  AdminStatsDTO,
  DiplomaListDTO,
  MfaChallengeDTO,
  PlatformSettingsDTO,
} from "@contract/dto";

/** Paged global audit response (mirrors the server's AdminAuditListDTO). */
export interface AdminAuditListDTO {
  items: AdminAuditEntryDTO[];
  total: number;
  page: number;
  pageSize: number;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : "";
}

/* ── Auth (admin realm) ───────────────────────────────────────────────────── */

export function adminLogin(input: AdminLoginInput): Promise<MfaChallengeDTO> {
  return post<MfaChallengeDTO>("/auth/admin/login", input);
}

export function adminVerifyTotp(code: string): Promise<AdminSessionDTO> {
  return post<AdminSessionDTO>("/auth/admin/login/totp", { code });
}

export function adminMe(): Promise<AdminSessionDTO> {
  return get<AdminSessionDTO>("/auth/admin/me");
}

export function adminLogout(): Promise<{ ok: boolean }> {
  return post<{ ok: boolean }>("/auth/admin/logout");
}

/* ── Stats ────────────────────────────────────────────────────────────────── */

export function getAdminStats(): Promise<AdminStatsDTO> {
  return get<AdminStatsDTO>("/admin/stats");
}

/* ── Schools ──────────────────────────────────────────────────────────────── */

export function listAdminSchools(
  query: Partial<ReviewSchoolsQuery> = {},
): Promise<AdminSchoolListDTO> {
  return get<AdminSchoolListDTO>(`/admin/schools${toQuery(query)}`);
}

export function getAdminSchool(id: string): Promise<AdminSchoolDetailDTO> {
  return get<AdminSchoolDetailDTO>(`/admin/schools/${encodeURIComponent(id)}`);
}

export function approveSchool(id: string): Promise<AdminSchoolDetailDTO> {
  return post<AdminSchoolDetailDTO>(`/admin/schools/${encodeURIComponent(id)}/approve`);
}

export function rejectSchool(id: string, reason: string): Promise<AdminSchoolDetailDTO> {
  return post<AdminSchoolDetailDTO>(`/admin/schools/${encodeURIComponent(id)}/reject`, { reason });
}

export function revokeSchool(id: string, reason: string): Promise<AdminSchoolDetailDTO> {
  return post<AdminSchoolDetailDTO>(`/admin/schools/${encodeURIComponent(id)}/revoke`, { reason });
}

export function revalidateSchool(id: string): Promise<AdminSchoolDetailDTO> {
  return post<AdminSchoolDetailDTO>(`/admin/schools/${encodeURIComponent(id)}/revalidate`);
}

/* ── Diplomas (read-only) ─────────────────────────────────────────────────── */

export function listAdminDiplomas(
  query: Partial<AdminDiplomasQuery> = {},
): Promise<DiplomaListDTO> {
  return get<DiplomaListDTO>(`/admin/diplomas${toQuery(query)}`);
}

/* ── Audit ────────────────────────────────────────────────────────────────── */

export function listAdminAudit(query: Partial<ListAuditQuery> = {}): Promise<AdminAuditListDTO> {
  return get<AdminAuditListDTO>(`/admin/audit${toQuery(query)}`);
}

/* ── Settings ─────────────────────────────────────────────────────────────── */

export function getSettings(): Promise<PlatformSettingsDTO> {
  return get<PlatformSettingsDTO>("/admin/settings");
}

export function updateSettings(input: UpdateSettingsInput): Promise<PlatformSettingsDTO> {
  return put<PlatformSettingsDTO>("/admin/settings", input);
}
