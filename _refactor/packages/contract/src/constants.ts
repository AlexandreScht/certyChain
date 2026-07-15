/**
 * Upload ceilings that are part of the public CDC API contract.
 *
 * Keeping these values in the contract package lets the request schema and the
 * server's byte-oriented guards share one source of truth.
 */
export const CDC_UPLOAD_LIMITS = {
  identityCsv: 2 * 1024 * 1024,
  crt: 2 * 1024 * 1024,
} as const;
