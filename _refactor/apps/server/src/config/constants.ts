/** App-wide constants (security-sensitive knobs live here, not scattered). */

export const COOKIE = {
  /** Access JWT (short-lived). */
  ACCESS: "cc_at",
  /** Refresh JWT (rotated). */
  REFRESH: "cc_rt",
  /** CSRF double-submit token (readable by JS, paired with header). */
  CSRF: "cc_csrf",
  /** Short-lived "MFA pending" token between the two login steps. */
  MFA: "cc_mfa",
} as const;

/**
 * Platform-admin realm cookies — fully isolated from the public (school/student)
 * realm so one browser can hold both a school and an admin session at once.
 */
export const ADMIN_COOKIE = {
  ACCESS: "cc_admin_at",
  REFRESH: "cc_admin_rt",
  CSRF: "cc_admin_csrf",
  MFA: "cc_admin_mfa",
} as const;

export type CookieRealm = "public" | "admin";

export const CSRF_HEADER = "x-csrf-token";

/** MFA / TOTP knobs (RFC 6238). */
export const MFA = {
  /** Lifetime of the short-lived "MFA pending" token between login steps (seconds). */
  CHALLENGE_TTL_SECONDS: 300,
  TOTP_STEP_SECONDS: 30,
  /** Accepted clock-drift window, in ± steps. */
  TOTP_WINDOW: 1,
  TOTP_DIGITS: 6,
  ISSUER: "CertifyChain",
} as const;

export const OTP = {
  LENGTH: 6,
  /** OTP validity window (seconds). */
  TTL_SECONDS: 600,
  /** Max verification attempts before invalidation. */
  MAX_ATTEMPTS: 5,
  /** Min delay between OTP requests for the same email (seconds). */
  RESEND_COOLDOWN: 30,
} as const;

export const VERIFICATION = {
  /** Single-use nonce validity (seconds) — short, anti-replay. */
  NONCE_TTL_SECONDS: 120,
} as const;

/** Ownership-verification knobs (verify.md security section). */
export const OWNERSHIP_VERIFICATION = {
  /** DNS-TXT token validity. */
  DNS_TOKEN_TTL_SECONDS: 72 * 3600,
  /** Postal code validity once dispatched. */
  POSTAL_CODE_TTL_SECONDS: 30 * 24 * 3600,
  /** OIDC (ProConnect) state/nonce validity. */
  OIDC_STATE_TTL_SECONDS: 10 * 60,
  /** Max wrong postal-code submissions before the attempt is locked. */
  POSTAL_MAX_ATTEMPTS: 5,
  /** Length of the mailed postal code. */
  POSTAL_CODE_LENGTH: 6,
} as const;

/** node:crypto scrypt parameters for admin password hashing. */
export const SCRYPT = {
  N: 1 << 15, // 32768
  r: 8,
  p: 1,
  keyLen: 64,
  saltLen: 16,
  maxmem: 64 * 1024 * 1024,
} as const;

export const SHARE_LINK = {
  TOKEN_BYTES: 24,
  /** Default expiry if the student picks "limited" without a value (days). */
  DEFAULT_EXPIRY_DAYS: 30,
} as const;

/**
 * Claim-link knobs — binds a school-issued delivery address (may go stale once
 * the holder leaves) to the holder's durable personal login email. TTL is
 * deliberately long: the whole point is surviving a student who doesn't check
 * their school inbox for weeks around graduation. Resend mints a fresh token.
 */
export const CLAIM = {
  TOKEN_BYTES: 24,
  TTL_SECONDS: 180 * 24 * 3600,
} as const;

/** Bulk CSV import limits (anti-DoS — one request must not amplify unbounded). */
export const CSV_IMPORT = {
  MAX_ROWS: 2000,
} as const;

/** Accrochage CDC product limits (stricter than the public portal ceiling). */
export const CDC = {
  MAX_BATCH: 500,
} as const;

/** OpenID4VCI / SD-JWT VC protocol and status-list parameters. */
export const VC = {
  OFFER_TTL_SEC: 600,
  TOKEN_TTL_SEC: 300,
  NONCE_TTL_SEC: 300,
  TX_CODE_LEN: 5,
  TX_MAX_ATTEMPTS: 3,
  VCT: "urn:certifychain:diploma:1",
  STATUS_LIST_CAPACITY: 4096,
  STATUS_TTL_SEC: 300,
} as const;

/**
 * Public transparency log (v2.md §V3). The advisory-lock key serializes
 * `leaf_index` assignment inside the issuance transaction so every committed
 * prefix stays contiguous (design D1) — a Postgres sequence would leave gaps on
 * rollback and let MVCC commit order diverge from index order.
 */
export const TRANSPARENCY = {
  /** Fixed int32 key for `pg_advisory_xact_lock` (arbitrary, dedicated to the log). */
  LOCK_KEY: 0x7c3a1d02,
  /** Debounce floor between on-demand checkpoints (bounds spam; D3). */
  CHECKPOINT_MIN_INTERVAL_SEC: 10,
  /** Hourly cron: sign a fresh checkpoint if the tree grew. */
  CHECKPOINT_CRON_MS: 3_600_000,
  /** OpenTimestamps retry/upgrade cron. */
  OTS_JOB_INTERVAL_MS: 1_800_000,
  /** Max checkpoints processed per OTS maintenance pass (bounded work). */
  OTS_BATCH: 10,
} as const;

/** Per-account login throttle (in-memory; single-instance MVP). */
export const LOGIN_THROTTLE = {
  MAX_FAILS: 5,
  LOCK_SECONDS: 15 * 60,
} as const;

/**
 * Rate-limit budgets (in-memory fixed window; single-instance MVP — back with
 * Redis for horizontal scale). Values are tuned around a key principle:
 *
 *   • Auth flows (login / OTP) are keyed on the TARGET ACCOUNT (email or user id),
 *     NOT on the IP — so 2 000 students behind one campus NAT, or a carrier CGNAT,
 *     each get their own budget, and an attacker rotating IPs cannot evade it.
 *   • The IP key is only a COARSE anti-flood backstop. Authenticated traffic is
 *     bucketed per user; anonymous traffic falls back to a *more generous* per-IP
 *     ceiling precisely because one egress IP can stand for many real people.
 *   • Hard brute-force stops stay per-account: OTP `MAX_ATTEMPTS`, the postal
 *     `POSTAL_MAX_ATTEMPTS`, and the progressive `LOGIN_THROTTLE` lockout.
 */
export const RATE_LIMIT = {
  /** Global backstop, per authenticated user (each isolated). */
  GLOBAL_USER: { max: 240, windowSec: 60 },
  /** Global backstop, per IP for anonymous traffic (tolerates shared NAT). */
  GLOBAL_IP: { max: 600, windowSec: 60 },
  /** OTP code requests — per target email (immune to shared IP / IP rotation). */
  OTP_REQUEST_EMAIL: { max: 5, windowSec: 15 * 60 },
  /** Platform-wide OTP send budget — bounds email cost vs. address-spraying. */
  OTP_SEND_GLOBAL: { max: 300, windowSec: 60 },
  /** OTP verification — per email (the per-code MAX_ATTEMPTS=5 is the hard stop). */
  OTP_VERIFY_EMAIL: { max: 20, windowSec: 10 * 60 },
  /** Password login — per email (complements the progressive lockout). */
  LOGIN_EMAIL: { max: 15, windowSec: 10 * 60 },
  /** TOTP second factor — per account (the MFA-pending subject). */
  TOTP_VERIFY_ACCOUNT: { max: 12, windowSec: 10 * 60 },
  /** Public verification surface (recruiter, anonymous) — per IP. */
  VERIFY_IP: { max: 60, windowSec: 60 },
  /** Public revocation oracle (`GET /verify/revocation/:id`) — per IP. Bounded so
      the endpoint can't be used to enumerate diplomas (404 stays uniform anyway). */
  VERIFY_REVOCATION_IP: { max: 60, windowSec: 60 },
  /** Public transparency-log surface (`/log/*`, recruiter/auditor) — per IP. */
  TRANSPARENCY_IP: { max: 30, windowSec: 60 },
  /** School ownership-proof mutations — per IP. */
  VERIFICATION_IP: { max: 30, windowSec: 60 },
  /** School self-registration — per IP. */
  REGISTER_IP: { max: 10, windowSec: 10 * 60 },
  /** Landing waitlist submissions — per IP (public, unauthenticated). */
  WAITLIST_IP: { max: 5, windowSec: 10 * 60 },
  /** Admin-triggered re-validation — per IP (route is admin-authed anyway). */
  ADMIN_REVALIDATE_IP: { max: 20, windowSec: 60 },
  /** Billing mutations (checkout/portal session creation) — per IP. */
  BILLING_IP: { max: 20, windowSec: 60 },
  /** Claim-link surface (info/otp request/otp verify) — per TOKEN, immune to
      IP rotation and shared NAT, same rationale as the auth-flow budgets above. */
  CLAIM_TOKEN: { max: 30, windowSec: 60 },
  /** Claim-link resend — per token, tighter (mints a fresh token + sends mail). */
  CLAIM_RESEND: { max: 3, windowSec: 3600 },
  /** CDC XML generation — per school, independent of the admin account used. */
  CDC_GENERATE: { max: 10, windowSec: 3600 },
  /** CDC identity CSV parsing/upserts — per school (CPU + encrypted DB writes). */
  CDC_IDENTITY_IMPORT: { max: 10, windowSec: 3600 },
  /** CDC processing-report parsing/reconciliation — per school. */
  CDC_CRT_INGEST: { max: 20, windowSec: 3600 },
  /** OpenID4VCI token exchange — coarse per-IP anti-flood protection. */
  VC_TOKEN: { max: 10, windowSec: 60 },
  /** Stateless nonce minting endpoint — per IP. */
  VC_NONCE: { max: 30, windowSec: 60 },
  /** Credential issuance endpoint — per IP, supplemented by one-shot offers. */
  VC_CREDENTIAL: { max: 10, windowSec: 60 },
  /** Internal EUDI offer creation — keyed by authenticated student. */
  VC_OFFER: { max: 10, windowSec: 60 },
} as const;
