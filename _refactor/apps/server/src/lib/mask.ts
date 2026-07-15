/**
 * Canonical names of fields that must never be emitted by the structured
 * logger. Keys are normalized so snake_case, camelCase and protocol spellings
 * all hit the same deny-list.
 */
const SENSITIVE_LOG_KEYS = new Set(
  [
    "password",
    "passwordhash",
    "privatekey",
    "privatekeyencrypted",
    "encryptedprivatekey",
    "privatejwk",
    "privatejwkencrypted",
    "encryptedholdersecret",
    "holdersecret",
    "secret",
    "token",
    "refreshtoken",
    "accesstoken",
    "preauthcode",
    "preauthcodehash",
    "preauthorizedcode",
    "preauthorizedcodehash",
    "txcode",
    "txcodehash",
    "codehash",
    "otp",
    "proof",
    "proofs",
    "proofjwt",
    "cnonce",
    "credential",
    "credentials",
    "credentialoffer",
    "sdjwt",
    "statuslistjwt",
    "offerpayload",
    "offerpayloadencrypted",
    // CDC identity data — deliberately listed here (the shared PII masking
    // boundary), not only at a logger call site.
    "nir",
    "nirencrypted",
    "birthlastname",
    "firstnames",
    "birthdate",
    "authorization",
    "cookie",
    "setcookie",
    "masterkey",
    "masterenckey",
    "otppepper",
  ],
);

function canonicalKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** True when a structured-log field contains a secret or direct identifier. */
export function isSensitiveLogKey(key: string): boolean {
  return SENSITIVE_LOG_KEYS.has(canonicalKey(key));
}

// The CDC creation XML carries the 13-character NIR stem, while a processing
// report may echo either that stem or the complete 15-character NIR. Both are
// commonly formatted with spaces, dots or dashes. Be deliberately conservative:
// a false positive merely hides an opaque identifier from a free-text diagnostic.
const CDC_IDENTIFIER_PATTERN =
  /(?<![0-9A-Z])(?:[0-9AB][ .-]*){12}[0-9AB](?:(?:[ .-]*[0-9AB]){2})?(?![0-9A-Z])/giu;

/**
 * Remove NIR-like identifiers from CDC-controlled free text before it reaches
 * persistent storage or an API response. The surrounding diagnostic remains
 * available to the school.
 */
export function redactCdcRejectReason(reason: string): string {
  return reason.replace(CDC_IDENTIFIER_PATTERN, "[identifiant CDC masqué]");
}

/**
 * Redacts an email address for display/logging: keeps the first 2 local-part
 * characters, masks the rest, keeps the domain (e.g. "al••••••@ecole.fr").
 *
 * Lives in `lib/` (not in an auth service) so any layer — including the mailer
 * and loggers — can mask recipient PII without importing a feature module.
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "••••";
  const visible = local.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(local.length - visible.length, 2))}@${domain}`;
}
