import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/* ── Enums ──────────────────────────────────────────────────────────────── */

export const schoolStatusEnum = pgEnum("school_status", [
  "pending",
  // Existence confirmed (SIRENE/AI or admin), but ownership not yet proven:
  // the school can sign in and explore, but CANNOT emit diplomas (no PKI keys).
  "provisional",
  "approved",
  "rejected",
  "revoked",
]);

/** Ownership-proof method a provisional school uses to reach `approved`. */
export const verificationMethodEnum = pgEnum("verification_method", [
  "dns",
  "postal",
  "proconnect",
]);

/** Lifecycle of a single ownership-verification attempt. */
export const verificationStatusEnum = pgEnum("verification_status_v", [
  "pending",
  "awaiting_payment",
  "code_sent",
  "verified",
  "failed",
  "cancelled",
]);

export const diplomaStatusEnum = pgEnum("diploma_status", ["active", "revoked"]);

/** Subscription tier (cahier des charges §5.1). Starter/Pro are self-serve
    (Stripe Checkout); Enterprise is contact-sales (custom pricing/SLA). */
export const schoolPlanEnum = pgEnum("school_plan", ["starter", "pro", "enterprise"]);

export const subjectTypeEnum = pgEnum("subject_type", ["school_admin", "student", "admin"]);

export const otpPurposeEnum = pgEnum("otp_purpose", ["student_login"]);

export const auditTypeEnum = pgEnum("audit_type", [
  "school_registered",
  "school_approved",
  "school_auto_approved",
  "school_provisional",
  "school_rejected",
  "school_revoked",
  "verification_method_chosen",
  "ownership_verified",
  "verification_failed",
  "school_login",
  "student_login",
  "admin_login",
  "issuance",
  "revocation",
  "share_created",
  "verification",
  "subscription_started",
  "subscription_updated",
  "subscription_canceled",
]);

export const verificationResultEnum = pgEnum("verification_result", [
  "verified",
  "not_found",
  "revoked",
  "expired",
  "invalid",
]);

/* ── Tables ─────────────────────────────────────────────────────────────── */

export const schools = pgTable("schools", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  siret: varchar("siret", { length: 14 }),
  /** UAI / RNE — official Éducation nationale establishment id (7 digits + 1 letter).
      Optional trust signal for AI scoring. */
  uai: text("uai"),
  /** City the establishment is located in — declared at registration and
      cross-checked against the official SIRENE commune (identifies WHICH school). */
  city: text("city"),
  accreditation: text("accreditation"),
  contactEmail: text("contact_email"),
  status: schoolStatusEnum("status").notNull().default("pending"),
  /** Ed25519 public key (SPKI PEM) — published, used to verify signatures. */
  publicKey: text("public_key"),
  /** Ed25519 private key, AES-256-GCM envelope-encrypted at rest. Never returned. */
  encryptedPrivateKey: text("encrypted_private_key"),
  /** Root-signed certificate (base64) binding {schoolId, publicKey} to CertifyChain root. */
  certificate: text("certificate"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  /* ── AI-assisted validation + admin review (CertifyChain admin portal) ──── */
  /** AI legitimacy score 0–100 (null = not evaluated / manual review). */
  validationScore: integer("validation_score"),
  validationReasoning: text("validation_reasoning"),
  /** Concise per-check breakdown behind the score (green/amber/red chips). */
  validationSignals: jsonb("validation_signals").$type<
    { label: string; status: "good" | "warn" | "bad" }[]
  >(),
  validationModel: text("validation_model"),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  /** True when the school was approved automatically by the AI score gate. */
  autoValidated: boolean("auto_validated").notNull().default(false),
  /** Reason captured on reject/revoke by a platform admin. */
  statusReason: text("status_reason"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedByAdminId: uuid("reviewed_by_admin_id"),
  /** SIRENE (INSEE) registry confirmation — authoritative source of truth.
      null = not checked, true = found+active, false = not found / closed. */
  sireneVerified: boolean("sirene_verified"),
  sireneLegalName: text("sirene_legal_name"),
  /** SIRENE establishment address (non-sensitive fields only — postal code +
      city, same partial disclosure already shown for the postal proof). Set
      only when SIRENE actually returned an address for this SIRET; gates the
      "postal" ownership-proof method (verify.md) on a CONFIRMED official
      address rather than "SIRET present + INSEE configured". */
  sirenePostalCode: varchar("sirene_postal_code", { length: 5 }),
  sireneCity: text("sirene_city"),
  /** Official domain CONFIRMED by a live web-search-grounded AI check (not a
      mere email-domain guess) — gates the "dns" ownership-proof method
      (verify.md) on genuine certainty. null = not confirmed / not attempted. */
  verifiedOfficialDomain: text("verified_official_domain"),
  /* ── Ownership proof (verify.md) — recorded when a control proof succeeds ── */
  /** Official domain proven/declared by the school (DNS-proof anchor). */
  domain: text("domain"),
  /** Which control proof unlocked `approved`: 'dns' | 'postal' | 'proconnect'. */
  controlProofMethod: text("control_proof_method"),
  controlProofAt: timestamp("control_proof_at", { withTimezone: true }),
  /** ProConnect `sub` — binds the org to a verified agent identity (revocable). */
  proconnectSub: text("proconnect_sub"),
  /* ── Billing (cahier des charges §5.1) — Stripe subscription state ────────── */
  /** Current tier, or null before any subscription. Kept as last-known value
      even after cancellation (history) — `subscriptionStatus` is the live gate. */
  plan: schoolPlanEnum("plan"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  /** Raw Stripe subscription status (active/trialing/past_due/canceled/…) —
      mirrored verbatim rather than re-modeled, so it never drifts from Stripe. */
  subscriptionStatus: text("subscription_status"),
  subscriptionCurrentPeriodEnd: timestamp("subscription_current_period_end", { withTimezone: true }),
}, (t) => ({
  // A SIRET identifies exactly one establishment → no two schools may claim the
  // same one. Partial (WHERE siret IS NOT NULL) so schools WITHOUT a SIRET stay
  // allowed; the app also checks/handles the conflict for a friendly 409.
  siretUnique: uniqueIndex("schools_siret_key")
    .on(t.siret)
    .where(sql`${t.siret} is not null`),
}));

export const schoolAdmins = pgTable(
  "school_admins",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name"),
    /** TOTP secret (base32), AES-256-GCM envelope-encrypted. Null until enrolled. */
    totpSecret: text("totp_secret"),
    totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => ({ emailIdx: uniqueIndex("school_admins_email_idx").on(sql`lower(${t.email})`) }),
);

/** Platform administrators (CertifyChain staff) — operate the admin portal. */
export const platformAdmins = pgTable(
  "platform_admins",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name"),
    /** TOTP secret (base32), AES-256-GCM envelope-encrypted. Null until enrolled. */
    totpSecret: text("totp_secret"),
    totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => ({ emailIdx: uniqueIndex("platform_admins_email_idx").on(sql`lower(${t.email})`) }),
);

/** Singleton platform settings (AI auto-validation toggle + threshold). */
export const platformSettings = pgTable("platform_settings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  autoValidateEnabled: boolean("auto_validate_enabled").notNull().default(false),
  autoValidateMinScore: integer("auto_validate_min_score").notNull().default(85),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedByAdminId: uuid("updated_by_admin_id"),
});

export const students = pgTable(
  "students",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: text("email").notNull(),
    fullName: text("full_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ emailIdx: uniqueIndex("students_email_idx").on(sql`lower(${t.email})`) }),
);

export const diplomas = pgTable("diplomas", {
  /** Public, non-predictable UUIDv4 — the diploma identifier. */
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  schoolId: uuid("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "restrict" }),
  studentId: uuid("student_id").references(() => students.id, { onDelete: "set null" }),
  holderName: text("holder_name").notNull(),
  holderEmail: text("holder_email").notNull(),
  programTitle: text("program_title").notNull(),
  mention: text("mention"),
  /** RNCP code of the certified title (per-diploma, optional). */
  rncp: text("rncp"),
  issuedAt: date("issued_at").notNull(),
  /** School's own internal id (for CSV import idempotency). */
  externalId: text("external_id"),
  /** Hex SHA-256 of the canonical diploma payload (what the school signed). */
  payloadHash: text("payload_hash").notNull(),
  /** Base64 Ed25519 signature of payloadHash by the school's private key. */
  signature: text("signature").notNull(),
  /** Random per-diploma holder secret, envelope-encrypted. Binds the nonce proof. */
  encryptedHolderSecret: text("encrypted_holder_secret").notNull(),
  status: diplomaStatusEnum("status").notNull().default("active"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revocationReason: text("revocation_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shareLinks = pgTable("share_links", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  diplomaId: uuid("diploma_id")
    .notNull()
    .references(() => diplomas.id, { onDelete: "cascade" }),
  /** URL-safe random token embedded in the public verification link. */
  token: text("token").notNull().unique(),
  createdByStudentId: uuid("created_by_student_id").references(() => students.id, {
    onDelete: "set null",
  }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revoked: boolean("revoked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verificationNonces = pgTable("verification_nonces", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  shareToken: text("share_token").notNull(),
  nonce: text("nonce").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const otpCodes = pgTable("otp_codes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  purpose: otpPurposeEnum("purpose").notNull().default("student_login"),
  /** HMAC-SHA256(code, OTP_PEPPER) — the plaintext code is never stored. */
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const refreshSessions = pgTable("refresh_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  subjectType: subjectTypeEnum("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  /** SHA-256 of the refresh token (token itself never stored). */
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A school's ownership-verification attempts (verify.md). The current attempt is
 * the most recent row whose status is not `cancelled`. Holds all secret material
 * (DNS token, hashed postal code, envelope-encrypted full postal address) and the
 * out-of-band state for OIDC/Stripe in `metadata`.
 */
export const schoolVerifications = pgTable("school_verifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  schoolId: uuid("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "cascade" }),
  method: verificationMethodEnum("method").notNull(),
  status: verificationStatusEnum("status").notNull().default("pending"),
  /** DNS-TXT proof: the random token the school must publish (not secret). */
  dnsToken: text("dns_token"),
  /** Postal proof: HMAC-SHA256 of the 6-digit code (plaintext never stored). */
  postalCodeHash: text("postal_code_hash"),
  /** Postal proof: full delivery address, AES-256-GCM envelope-encrypted. */
  postalAddressEnc: text("postal_address_enc"),
  /** Partial address, safe to display (street number only). */
  postalStreetNo: text("postal_street_no"),
  postalPostalCode: varchar("postal_postal_code", { length: 5 }),
  postalCity: text("postal_city"),
  /** Stripe Checkout Session id (postal proof is paid before dispatch). */
  stripeSessionId: text("stripe_session_id"),
  /** 'unpaid' | 'paid' — gate that releases the postal dispatch. */
  paymentStatus: text("payment_status"),
  attempts: integer("attempts").notNull().default(0),
  /** Out-of-band data (OIDC state+nonce, etc.) — never secrets at rest. */
  metadata: jsonb("metadata"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  type: auditTypeEnum("type").notNull(),
  result: verificationResultEnum("result"),
  schoolId: uuid("school_id"),
  diplomaId: uuid("diploma_id"),
  /** Anonymized subject (e.g. salted hash of ip+ua) — RGPD: no raw PII. */
  anonymizedSubject: text("anonymized_subject"),
  ipHash: text("ip_hash"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ── Inferred types ─────────────────────────────────────────────────────── */

export type School = typeof schools.$inferSelect;
export type NewSchool = typeof schools.$inferInsert;
export type SchoolAdmin = typeof schoolAdmins.$inferSelect;
export type PlatformAdmin = typeof platformAdmins.$inferSelect;
export type NewPlatformAdmin = typeof platformAdmins.$inferInsert;
export type PlatformSettings = typeof platformSettings.$inferSelect;
export type Student = typeof students.$inferSelect;
export type Diploma = typeof diplomas.$inferSelect;
export type NewDiploma = typeof diplomas.$inferInsert;
export type ShareLink = typeof shareLinks.$inferSelect;
export type VerificationNonce = typeof verificationNonces.$inferSelect;
export type OtpCode = typeof otpCodes.$inferSelect;
export type RefreshSession = typeof refreshSessions.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
export type SchoolVerification = typeof schoolVerifications.$inferSelect;
export type NewSchoolVerification = typeof schoolVerifications.$inferInsert;
