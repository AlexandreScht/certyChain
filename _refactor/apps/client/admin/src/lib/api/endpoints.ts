/**
 * Endpoints du realm admin plateforme (`cc_admin_*`).
 *
 * Wrappers minces au-dessus du client RPC typé (`api`, `hc<AppType>`) — chemins,
 * méthodes et corps INFÉRÉS des routes Hono ; les annotations DTO font le pont
 * inverse (dérive serveur ↔ contrat = erreur de compilation).
 */
import { api, unwrap } from "./client";

import { toQueryRecord } from "@certifychain/shared/lib/query";
import type {
  AdminLoginInput,
  AdminDiplomasQuery,
  ListAuditQuery,
  ReviewSchoolsQuery,
  UpdateSettingsInput,
} from "@certifychain/contract/schemas";
import type {
  AdminAuditEntryDTO,
  AdminSchoolDetailDTO,
  AdminSchoolListDTO,
  AdminSessionDTO,
  AdminStatsDTO,
  DiplomaListDTO,
  MfaChallengeDTO,
  PlatformSettingsDTO,
} from "@certifychain/contract/dto";

/** Paged global audit response (mirrors the server's AdminAuditListDTO). */
export interface AdminAuditListDTO {
  items: AdminAuditEntryDTO[];
  total: number;
  page: number;
  pageSize: number;
}

/* ── Auth (admin realm) ───────────────────────────────────────────────────── */

export function adminLogin(input: AdminLoginInput): Promise<MfaChallengeDTO> {
  return unwrap(api.auth.admin.login.$post({ json: input }));
}

export function adminVerifyTotp(code: string): Promise<AdminSessionDTO> {
  return unwrap(api.auth.admin.login.totp.$post({ json: { code } }));
}

export function adminMe(): Promise<AdminSessionDTO> {
  return unwrap(api.auth.admin.me.$get());
}

export function adminLogout(): Promise<{ ok: boolean }> {
  return unwrap(api.auth.admin.logout.$post());
}

/* ── Stats ────────────────────────────────────────────────────────────────── */

export function getAdminStats(): Promise<AdminStatsDTO> {
  return unwrap(api.admin.stats.$get());
}

/* ── Schools ──────────────────────────────────────────────────────────────── */

export function listAdminSchools(
  query: Partial<ReviewSchoolsQuery> = {},
): Promise<AdminSchoolListDTO> {
  return unwrap(api.admin.schools.$get({ query: toQueryRecord(query) }));
}

export function getAdminSchool(id: string): Promise<AdminSchoolDetailDTO> {
  return unwrap(api.admin.schools[":id"].$get({ param: { id } }));
}

export function approveSchool(id: string): Promise<AdminSchoolDetailDTO> {
  return unwrap(api.admin.schools[":id"].approve.$post({ param: { id } }));
}

export function rejectSchool(id: string, reason: string): Promise<AdminSchoolDetailDTO> {
  return unwrap(api.admin.schools[":id"].reject.$post({ param: { id }, json: { reason } }));
}

export function revokeSchool(id: string, reason: string): Promise<AdminSchoolDetailDTO> {
  return unwrap(api.admin.schools[":id"].revoke.$post({ param: { id }, json: { reason } }));
}

/** Lift a transparency-journal issuance freeze (v2.md §V3-6). */
export function unfreezeSchool(id: string): Promise<AdminSchoolDetailDTO> {
  return unwrap(api.admin.schools[":id"].unfreeze.$post({ param: { id } }));
}

export function revalidateSchool(id: string): Promise<AdminSchoolDetailDTO> {
  return unwrap(api.admin.schools[":id"].revalidate.$post({ param: { id } }));
}

export function setSchoolCdcEnabled(
  id: string,
  enabled: boolean,
): Promise<AdminSchoolDetailDTO> {
  return unwrap(api.admin.schools[":id"].cdc.$post({ param: { id }, json: { enabled } }));
}

/* ── Diplomas (read-only) ─────────────────────────────────────────────────── */

export function listAdminDiplomas(
  query: Partial<AdminDiplomasQuery> = {},
): Promise<DiplomaListDTO> {
  return unwrap(api.admin.diplomas.$get({ query: toQueryRecord(query) }));
}

/* ── Audit ────────────────────────────────────────────────────────────────── */

export function listAdminAudit(query: Partial<ListAuditQuery> = {}): Promise<AdminAuditListDTO> {
  return unwrap(api.admin.audit.$get({ query: toQueryRecord(query) }));
}

/* ── Settings ─────────────────────────────────────────────────────────────── */

export function getSettings(): Promise<PlatformSettingsDTO> {
  return unwrap(api.admin.settings.$get());
}

export function updateSettings(input: UpdateSettingsInput): Promise<PlatformSettingsDTO> {
  return unwrap(api.admin.settings.$put({ json: input }));
}
