export type VcOAuthError =
  | "invalid_request"
  | "invalid_grant"
  | "unsupported_grant_type"
  | "invalid_token"
  | "invalid_proof"
  | "invalid_nonce"
  | "invalid_credential_request"
  | "unknown_credential_configuration"
  | "unknown_credential_identifier"
  | "invalid_encryption_parameters"
  | "credential_request_denied"
  | "temporarily_unavailable"
  | "slow_down";

/** Expected protocol failure serialized by vc.routes in OAuth/OID4VCI form. */
export class VcProtocolError extends Error {
  constructor(
    readonly error: VcOAuthError,
    readonly status: 400 | 401 | 429 | 503 = 400,
  ) {
    super(error);
    this.name = "VcProtocolError";
  }
}

/** Keep every public protocol failure wallet-parseable, including outages. */
export function normalizeVcProtocolError(error: unknown): VcProtocolError {
  return error instanceof VcProtocolError
    ? error
    : new VcProtocolError("temporarily_unavailable", 503);
}
