/** Stable, machine-readable error codes returned by the API. */
export const ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "validation_error",
  "conflict",
  "rate_limited",
  "csrf_failed",
  "invalid_credentials",
  "otp_invalid",
  "otp_expired",
  "otp_locked",
  "school_not_approved",
  "verification_unavailable",
  "verification_in_progress",
  "verification_failed",
  "payment_unavailable",
  "mfa_required",
  "mfa_invalid",
  "payload_too_large",
  "service_unavailable",
  "internal_error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}
