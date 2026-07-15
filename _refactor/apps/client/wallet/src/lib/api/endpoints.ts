/**
 * Endpoints du realm wallet (élève : OTP, portefeuille, partage, claim).
 *
 * Wrappers minces au-dessus du client RPC typé (`api`, `hc<AppType>`) — chemins,
 * méthodes et corps INFÉRÉS des routes Hono ; les annotations DTO font le pont
 * inverse (dérive serveur ↔ contrat = erreur de compilation).
 *
 * Volontairement limité aux fonctions RÉELLEMENT utilisées par cette app
 * (les sections école/vérification/diplômes héritées de l'ancienne copie
 * triplée étaient du code mort ici — supprimées à la refonte 2026-07).
 */
import { api, unwrap } from "./client";

import type { RequestOtpInput, VerifyOtpInput, CreateShareLinkInput } from "@certifychain/contract/schemas";
import type {
  EudiOfferDTO,
  SessionDTO,
  WalletDiplomaDTO,
  ShareLinkDTO,
  ClaimInfoDTO,
} from "@certifychain/contract/dto";

/* ── Auth (élève, OTP email) ────────────────────────────────────────────── */

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

/* ── Claim (rattacher un diplôme émis à un wallet personnel) ─────────────── */

export function getClaimInfo(token: string): Promise<ClaimInfoDTO> {
  return unwrap(api.auth.student.claim[":token"].$get({ param: { token } }));
}

export function requestClaimOtp(
  token: string,
  input: RequestOtpInput,
): Promise<{ ok: boolean }> {
  return unwrap(
    api.auth.student.claim[":token"].otp.request.$post({ param: { token }, json: input }),
  );
}

export function verifyClaimOtp(
  token: string,
  input: VerifyOtpInput,
): Promise<SessionDTO> {
  return unwrap(
    api.auth.student.claim[":token"].otp.verify.$post({ param: { token }, json: input }),
  );
}

export function resendClaim(token: string): Promise<{ ok: boolean }> {
  return unwrap(api.auth.student.claim[":token"].resend.$post({ param: { token } }));
}

/* ── Wallet / partage ───────────────────────────────────────────────────── */

export function getWalletDiplomas(): Promise<WalletDiplomaDTO[]> {
  return unwrap(api.wallet.diplomas.$get());
}

export function getWalletDiploma(id: string): Promise<WalletDiplomaDTO> {
  return unwrap(api.wallet.diplomas[":id"].$get({ param: { id } }));
}

/** Create a short-lived, single-use OpenID4VCI credential offer. */
export function createEudiOffer(id: string): Promise<EudiOfferDTO> {
  return unwrap(
    api.wallet.diplomas[":id"]["eudi-offer"].$post({ param: { id } }),
  );
}

export function listShareLinks(id: string): Promise<ShareLinkDTO[]> {
  return unwrap(api.wallet.diplomas[":id"].shares.$get({ param: { id } }));
}

export function createShareLink(
  id: string,
  input: CreateShareLinkInput,
): Promise<ShareLinkDTO> {
  return unwrap(api.wallet.diplomas[":id"].share.$post({ param: { id }, json: input }));
}

export function revokeShareLink(token: string): Promise<{ ok: boolean }> {
  return unwrap(api.wallet.shares[":token"].revoke.$post({ param: { token } }));
}
