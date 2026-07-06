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
  RequestOtpInput,
  VerifyOtpInput,
  CreateDiplomaInput,
  ListDiplomasQuery,
  RevokeDiplomaInput,
  VerifyProofInput,
  ChooseVerificationMethodInput,
  StartCheckoutInput,
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
  ProConnectStartDTO,
  ImportResultDTO,
  BillingStateDTO,
  BillingRedirectDTO,
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
