/**
 * Endpoints du realm public (portail École + page publique /verify).
 *
 * Chaque fonction est un mince wrapper au-dessus du client RPC typé (`api`,
 * `hc<AppType>`): le chemin, la méthode et le corps sont INFÉRÉS des routes
 * Hono du serveur — si une route ou un schéma change côté serveur, la
 * compilation de ce fichier casse. Les annotations de retour (DTO du contrat)
 * font le pont inverse : si la réponse réelle du serveur dérive du DTO,
 * l'assignation échoue aussi à la compilation.
 */
import { api, csrfFetch, unwrap, API_BASE } from "./client";

import { toQueryRecord } from "@certifychain/shared/lib/query";
import type {
  SchoolLoginInput,
  RegisterSchoolInput,
  WaitlistInput,
  RequestOtpInput,
  VerifyOtpInput,
  CreateDiplomaInput,
  ListDiplomasQuery,
  RevokeDiplomaInput,
  VerifyProofInput,
  ChooseVerificationMethodInput,
  StartCheckoutInput,
  UpdateCdcSettingsInput,
  CdcIdentityFormInput,
  CreateCdcExportInput,
  ListCdcExportsQuery,
  ListJournalQuery,
  ReportJournalEntryInput,
} from "@certifychain/contract/schemas";
import type {
  SessionDTO,
  MfaChallengeDTO,
  SchoolDTO,
  SchoolStatsDTO,
  DiplomaDTO,
  DiplomaListDTO,
  VerificationChallengeDTO,
  VerificationResultDTO,
  VerificationStateDTO,
  RevocationStatusDTO,
  ProConnectStartDTO,
  ImportResultDTO,
  BillingStateDTO,
  BillingRedirectDTO,
  CdcSettingsDTO,
  CdcEligibleDiplomaDTO,
  CdcIdentitySummaryDTO,
  CdcIdentityImportResultDTO,
  CdcExportDetailDTO,
  CdcExportListDTO,
  LogCheckpointDTO,
  TransparencyProofDTO,
  SchoolJournalDTO,
  ReportJournalResultDTO,
} from "@certifychain/contract/dto";

/* ── Auth ───────────────────────────────────────────────────────────────── */

/** Step 1 of school login: password → returns an MFA (TOTP) challenge. */
export function loginSchool(input: SchoolLoginInput): Promise<MfaChallengeDTO> {
  return unwrap(api.auth.school.login.$post({ json: input }));
}

/** Step 2 of school login: verify the TOTP code → establishes the session. */
export function verifySchoolTotp(code: string): Promise<SessionDTO> {
  return unwrap(api.auth.school.login.totp.$post({ json: { code } }));
}

export function requestOtp(input: RequestOtpInput): Promise<{ ok: boolean }> {
  return unwrap(api.auth.student.otp.request.$post({ json: input }));
}

export function verifyOtp(input: VerifyOtpInput): Promise<SessionDTO> {
  return unwrap(api.auth.student.otp.verify.$post({ json: input }));
}

export function me(): Promise<SessionDTO> {
  return unwrap(api.auth.me.$get());
}

export function logout(): Promise<{ ok: boolean }> {
  return unwrap(api.auth.logout.$post());
}

/* ── Schools ────────────────────────────────────────────────────────────── */

export function registerSchool(
  input: RegisterSchoolInput,
): Promise<{ schoolId: string; status: string }> {
  return unwrap(api.schools.register.$post({ json: input }));
}

/** Landing waitlist — forwards the prospect's email to the team inbox. */
export function joinWaitlist(input: WaitlistInput): Promise<{ ok: boolean }> {
  return unwrap(api.schools.waitlist.$post({ json: input }));
}

export function getMySchool(): Promise<SchoolDTO> {
  return unwrap(api.schools.me.$get());
}

export function getMyStats(): Promise<SchoolStatsDTO> {
  return unwrap(api.schools.me.stats.$get());
}

export function activateSchool(): Promise<SchoolDTO> {
  return unwrap(api.schools.me.activate.$post());
}

/* ── Ownership verification (verify.md) ─────────────────────────────────── */

export function getVerificationState(): Promise<VerificationStateDTO> {
  return unwrap(api.verification.me.$get());
}

export function chooseVerificationMethod(
  input: ChooseVerificationMethodInput,
): Promise<VerificationStateDTO> {
  return unwrap(api.verification.me.choose.$post({ json: input }));
}

export function switchVerificationMethod(): Promise<VerificationStateDTO> {
  return unwrap(api.verification.me.switch.$post());
}

export function verifyDnsOwnership(): Promise<VerificationStateDTO> {
  return unwrap(api.verification.me.dns.verify.$post());
}

export function submitPostalCode(code: string): Promise<VerificationStateDTO> {
  return unwrap(api.verification.me.postal.submit.$post({ json: { code } }));
}

export function startProConnect(): Promise<ProConnectStartDTO> {
  return unwrap(api.verification.me.proconnect.start.$get());
}

/* ── Billing (cahier des charges §5.1) ────────────────────────────────────── */

export function getBillingState(): Promise<BillingStateDTO> {
  return unwrap(api.billing.me.$get());
}

export function startCheckout(input: StartCheckoutInput): Promise<BillingRedirectDTO> {
  return unwrap(api.billing.me.checkout.$post({ json: input }));
}

export function startBillingPortal(): Promise<BillingRedirectDTO> {
  return unwrap(api.billing.me.portal.$post());
}

/* ── Diplomas ───────────────────────────────────────────────────────────── */

export function listDiplomas(
  query: Partial<ListDiplomasQuery> = {},
): Promise<DiplomaListDTO> {
  return unwrap(api.diplomas.$get({ query: toQueryRecord(query) }));
}

export function createDiploma(input: CreateDiplomaInput): Promise<DiplomaDTO> {
  return unwrap(api.diplomas.$post({ json: input }));
}

export function revokeDiploma(
  id: string,
  input: RevokeDiplomaInput,
): Promise<DiplomaDTO> {
  return unwrap(api.diplomas[":id"].revoke.$post({ param: { id }, json: input }));
}

/** Import CSV — multipart brut, hors RPC (la route parse le FormData elle-même). */
export async function importDiplomasCsv(file: File): Promise<ImportResultDTO> {
  const form = new FormData();
  form.append("file", file);
  const res = await csrfFetch(`${API_BASE}/diplomas/import`, {
    method: "POST",
    body: form,
  });
  return (await unwrap(res)) as ImportResultDTO;
}

/* ── Accrochage CDC ────────────────────────────────────────────────────── */

export function getCdcSettings(): Promise<CdcSettingsDTO> {
  return unwrap(api.cdc.settings.$get());
}

export function updateCdcSettings(input: UpdateCdcSettingsInput): Promise<CdcSettingsDTO> {
  return unwrap(api.cdc.settings.$put({ json: input }));
}

export function listCdcEligibleDiplomas(): Promise<CdcEligibleDiplomaDTO[]> {
  return unwrap(api.cdc.eligible.$get());
}

export function saveCdcIdentity(
  input: CdcIdentityFormInput,
): Promise<CdcIdentitySummaryDTO> {
  return unwrap(api.cdc.identities.$post({ json: input }));
}

export async function importCdcIdentitiesCsv(
  file: File,
): Promise<CdcIdentityImportResultDTO> {
  const form = new FormData();
  form.append("file", file);
  const response = await csrfFetch(`${API_BASE}/cdc/identities/import`, {
    method: "POST",
    body: form,
  });
  return (await unwrap(response)) as CdcIdentityImportResultDTO;
}

export function deleteCdcIdentity(diplomaId: string): Promise<{ ok: boolean }> {
  return unwrap(api.cdc.identities[":diplomaId"].$delete({ param: { diplomaId } }));
}

export function createCdcExport(input: CreateCdcExportInput): Promise<CdcExportDetailDTO> {
  return unwrap(api.cdc.exports.$post({ json: input }));
}

export function listCdcExports(
  query: Partial<ListCdcExportsQuery> = {},
): Promise<CdcExportListDTO> {
  return unwrap(api.cdc.exports.$get({ query: toQueryRecord(query) }));
}

export function getCdcExport(id: string): Promise<CdcExportDetailDTO> {
  return unwrap(api.cdc.exports[":id"].$get({ param: { id } }));
}

export function markCdcExportSubmitted(id: string): Promise<CdcExportDetailDTO> {
  return unwrap(api.cdc.exports[":id"].submitted.$post({ param: { id } }));
}

export function uploadCdcCrt(id: string, content: string): Promise<CdcExportDetailDTO> {
  return unwrap(api.cdc.exports[":id"].crt.$post({ param: { id }, json: { content } }));
}

export function cancelCdcExport(id: string): Promise<CdcExportDetailDTO> {
  return unwrap(api.cdc.exports[":id"].cancel.$post({ param: { id } }));
}

export async function downloadCdcExport(
  id: string,
): Promise<{ blob: Blob; fileName: string }> {
  const response = await csrfFetch(`${API_BASE}/cdc/exports/${encodeURIComponent(id)}/file`);
  if (!response.ok) await unwrap(response);
  const disposition = response.headers.get("content-disposition") ?? "";
  const fileName = /filename="([^"]+)"/i.exec(disposition)?.[1] ?? `accrochage-${id}.xml`;
  return { blob: await response.blob(), fileName };
}

/* ── Public verification ────────────────────────────────────────────────── */

export function verifyChallenge(token: string): Promise<VerificationChallengeDTO> {
  return unwrap(api.verify[":token"].challenge.$post({ param: { token } }));
}

export function verifyProof(
  token: string,
  input: VerifyProofInput,
): Promise<VerificationResultDTO> {
  return unwrap(api.verify[":token"].proof.$post({ param: { token }, json: input }));
}

/**
 * Revocation oracle — re-checks a bundle's diploma independently of the share
 * link. 200 → `{ status: "active", checkedAt }`. A uniform 404 (thrown as an
 * `ApiClientError` with `status === 404`) means revoked OR unknown: on a bundle
 * that is otherwise cryptographically valid, the caller reads 404 as "revoked".
 */
export function checkRevocation(diplomaId: string): Promise<RevocationStatusDTO> {
  return unwrap(api.verify.revocation[":diplomaId"].$get({ param: { diplomaId } }));
}

/* ── Registre public de transparence (v2.md §V3) ────────────────────────── */

/** Latest signed checkpoint (STH) of the public issuance log — no auth, no PII. */
export function getLogCheckpoint(): Promise<LogCheckpointDTO> {
  return unwrap(api.log.checkpoint.$get());
}

/**
 * RFC 6962 inclusion proof for one diploma. A uniform 404 means malformed,
 * unknown OR not yet journaled (anti-enumeration, mirror of `/verify/revocation`).
 */
export function getInclusionProof(diplomaId: string): Promise<TransparencyProofDTO> {
  return unwrap(api.log.inclusion[":diplomaId"].$get({ param: { diplomaId } }));
}

/* ── Journal de transparence — portail école (v2.md §V3-6) ──────────────── */

/** The school's own issuance journal (paginated) + its freeze status. */
export function getSchoolJournal(
  query: Partial<ListJournalQuery> = {},
): Promise<SchoolJournalDTO> {
  return unwrap(api.schools.journal.$get({ query: toQueryRecord(query) }));
}

/**
 * Flag an issuance the school did not make. Side effect (by design): freezes
 * ALL further issuance for this school until a platform admin unfreezes it.
 */
export function reportJournalEntry(
  input: ReportJournalEntryInput,
): Promise<ReportJournalResultDTO> {
  return unwrap(api.schools.journal.report.$post({ json: input }));
}
