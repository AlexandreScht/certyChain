import type { ErrorCode } from "../contract/errors";

/** Typed application error mapped to an HTTP status + machine-readable code. */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const fail = {
  unauthorized: (m = "Authentification requise") => new AppError(401, "unauthorized", m),
  forbidden: (m = "Accès refusé") => new AppError(403, "forbidden", m),
  notFound: (m = "Ressource introuvable") => new AppError(404, "not_found", m),
  validation: (m = "Données invalides", details?: unknown) =>
    new AppError(422, "validation_error", m, details),
  conflict: (m = "Conflit") => new AppError(409, "conflict", m),
  rateLimited: (m = "Trop de requêtes, réessayez plus tard") =>
    new AppError(429, "rate_limited", m),
  csrf: (m = "Jeton CSRF invalide ou manquant") => new AppError(403, "csrf_failed", m),
  invalidCredentials: (m = "Identifiants invalides") =>
    new AppError(401, "invalid_credentials", m),
  otpInvalid: (m = "Code invalide") => new AppError(401, "otp_invalid", m),
  otpExpired: (m = "Code expiré") => new AppError(401, "otp_expired", m),
  otpLocked: (m = "Trop de tentatives, demandez un nouveau code") =>
    new AppError(429, "otp_locked", m),
  schoolNotApproved: (m = "Établissement non approuvé") =>
    new AppError(403, "school_not_approved", m),
  verificationUnavailable: (m = "Méthode de vérification indisponible") =>
    new AppError(409, "verification_unavailable", m),
  verificationInProgress: (m = "Une vérification est déjà en cours") =>
    new AppError(409, "verification_in_progress", m),
  verificationFailed: (m = "La vérification a échoué") =>
    new AppError(422, "verification_failed", m),
  paymentUnavailable: (m = "Paiement momentanément indisponible") =>
    new AppError(503, "payment_unavailable", m),
  mfaRequired: (m = "Authentification à deux facteurs requise") =>
    new AppError(401, "mfa_required", m),
  mfaInvalid: (m = "Code d'authentification invalide") =>
    new AppError(401, "mfa_invalid", m),
  payloadTooLarge: (m = "Charge utile trop volumineuse") =>
    new AppError(413, "payload_too_large", m),
  serviceUnavailable: (m = "Service momentanément indisponible") =>
    new AppError(503, "service_unavailable", m),
  internal: (m = "Erreur interne") => new AppError(500, "internal_error", m),
};
