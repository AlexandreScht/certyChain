import { get, post, postRaw } from "./client";

import type {
  SchoolLoginInput,
  RegisterSchoolInput,
  RequestOtpInput,
  VerifyOtpInput,
  CreateDiplomaInput,
  ListDiplomasQuery,
  RevokeDiplomaInput,
  CreateShareLinkInput,
  VerifyProofInput,
  ChooseVerificationMethodInput,
  StartCheckoutInput,
} from "@contract/schemas";
import type {
  SessionDTO,
  MfaChallengeDTO,
  SchoolDTO,
  SchoolStatsDTO,
  DiplomaDTO,
  DiplomaListDTO,
  WalletDiplomaDTO,
  ShareLinkDTO,
  VerificationChallengeDTO,
  VerificationResultDTO,
  VerificationStateDTO,
  ProConnectStartDTO,
  ImportResultDTO,
  BillingStateDTO,
  BillingRedirectDTO,
} from "@contract/dto";

/** Builds a `?key=value` query string from a partial query object. */
function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : "";
}

/* ── Auth ───────────────────────────────────────────────────────────────── */

/** Step 1 of school login: password → returns an MFA (TOTP) challenge. */
export function loginSchool(input: SchoolLoginInput): Promise<MfaChallengeDTO> {
  return post<MfaChallengeDTO>("/auth/school/login", input);
}

/** Step 2 of school login: verify the TOTP code → establishes the session. */
export function verifySchoolTotp(code: string): Promise<SessionDTO> {
  return post<SessionDTO>("/auth/school/login/totp", { code });
}

export function requestOtp(input: RequestOtpInput): Promise<{ ok: boolean }> {
  return post<{ ok: boolean }>("/auth/student/otp/request", input);
}

export function verifyOtp(input: VerifyOtpInput): Promise<SessionDTO> {
  return post<SessionDTO>("/auth/student/otp/verify", input);
}

export function me(): Promise<SessionDTO> {
  return get<SessionDTO>("/auth/me");
}

export function logout(): Promise<{ ok: boolean }> {
  return post<{ ok: boolean }>("/auth/logout");
}

/* ── Schools ────────────────────────────────────────────────────────────── */

export function registerSchool(
  input: RegisterSchoolInput,
): Promise<{ schoolId: string; status: string }> {
  return post<{ schoolId: string; status: string }>("/schools/register", input);
}

export function getMySchool(): Promise<SchoolDTO> {
  return get<SchoolDTO>("/schools/me");
}

export function getMyStats(): Promise<SchoolStatsDTO> {
  return get<SchoolStatsDTO>("/schools/me/stats");
}

export function activateSchool(): Promise<SchoolDTO> {
  return post<SchoolDTO>("/schools/me/activate");
}

/* ── Ownership verification (verify.md) ─────────────────────────────────── */

export function getVerificationState(): Promise<VerificationStateDTO> {
  return get<VerificationStateDTO>("/verification/me");
}

export function chooseVerificationMethod(
  input: ChooseVerificationMethodInput,
): Promise<VerificationStateDTO> {
  return post<VerificationStateDTO>("/verification/me/choose", input);
}

export function switchVerificationMethod(): Promise<VerificationStateDTO> {
  return post<VerificationStateDTO>("/verification/me/switch");
}

export function verifyDnsOwnership(): Promise<VerificationStateDTO> {
  return post<VerificationStateDTO>("/verification/me/dns/verify");
}

export function submitPostalCode(code: string): Promise<VerificationStateDTO> {
  return post<VerificationStateDTO>("/verification/me/postal/submit", { code });
}

export function startProConnect(): Promise<ProConnectStartDTO> {
  return get<ProConnectStartDTO>("/verification/me/proconnect/start");
}

/* ── Billing (cahier des charges §5.1) ────────────────────────────────────── */

export function getBillingState(): Promise<BillingStateDTO> {
  return get<BillingStateDTO>("/billing/me");
}

export function startCheckout(input: StartCheckoutInput): Promise<BillingRedirectDTO> {
  return post<BillingRedirectDTO>("/billing/me/checkout", input);
}

export function startBillingPortal(): Promise<BillingRedirectDTO> {
  return post<BillingRedirectDTO>("/billing/me/portal");
}

/* ── Diplomas ───────────────────────────────────────────────────────────── */

export function listDiplomas(
  query: Partial<ListDiplomasQuery> = {},
): Promise<DiplomaListDTO> {
  return get<DiplomaListDTO>(`/diplomas${toQuery(query)}`);
}

export function createDiploma(input: CreateDiplomaInput): Promise<DiplomaDTO> {
  return post<DiplomaDTO>("/diplomas", input);
}

export function revokeDiploma(
  id: string,
  input: RevokeDiplomaInput,
): Promise<DiplomaDTO> {
  return post<DiplomaDTO>(`/diplomas/${encodeURIComponent(id)}/revoke`, input);
}

export function importDiplomasCsv(file: File): Promise<ImportResultDTO> {
  const form = new FormData();
  form.append("file", file);
  return postRaw<ImportResultDTO>("/diplomas/import", form);
}

/* ── Wallet / share ─────────────────────────────────────────────────────── */

export function getWalletDiplomas(): Promise<WalletDiplomaDTO[]> {
  return get<WalletDiplomaDTO[]>("/wallet/diplomas");
}

export function getWalletDiploma(id: string): Promise<WalletDiplomaDTO> {
  return get<WalletDiplomaDTO>(`/wallet/diplomas/${encodeURIComponent(id)}`);
}

export function listShareLinks(id: string): Promise<ShareLinkDTO[]> {
  return get<ShareLinkDTO[]>(`/wallet/diplomas/${encodeURIComponent(id)}/shares`);
}

export function createShareLink(
  id: string,
  input: CreateShareLinkInput,
): Promise<ShareLinkDTO> {
  return post<ShareLinkDTO>(
    `/wallet/diplomas/${encodeURIComponent(id)}/share`,
    input,
  );
}

export function revokeShareLink(token: string): Promise<{ ok: boolean }> {
  return post<{ ok: boolean }>(
    `/wallet/shares/${encodeURIComponent(token)}/revoke`,
  );
}

/* ── Public verification ────────────────────────────────────────────────── */

export function verifyChallenge(
  token: string,
): Promise<VerificationChallengeDTO> {
  return post<VerificationChallengeDTO>(
    `/verify/${encodeURIComponent(token)}/challenge`,
  );
}

export function verifyProof(
  token: string,
  input: VerifyProofInput,
): Promise<VerificationResultDTO> {
  return post<VerificationResultDTO>(
    `/verify/${encodeURIComponent(token)}/proof`,
    input,
  );
}
