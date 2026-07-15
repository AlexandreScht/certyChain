import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  index,
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

/** Postgres `bytea` (no native Drizzle column type) — read/written as a Buffer.
    Used for detached OpenTimestamps proofs on transparency checkpoints. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

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

export const otpPurposeEnum = pgEnum("otp_purpose", ["student_login", "student_claim"]);

export const cdcExportStatusEnum = pgEnum("cdc_export_status", [
  "generated",
  "submitted",
  "accepted",
  "partially_rejected",
  "rejected",
  "cancelled",
]);

export const cdcItemStatusEnum = pgEnum("cdc_item_status", [
  "pending",
  "accepted",
  "rejected",
]);

export const cdcIdentitySourceEnum = pgEnum("cdc_identity_source", ["csv", "form"]);

export const cdcObtentionMethodEnum = pgEnum("cdc_obtention_method", [
  "PAR_ADMISSION",
  "PAR_SCORING",
]);

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
  "student_claim",
  "admin_login",
  "issuance",
  "revocation",
  "share_created",
  "verification",
  "subscription_started",
  "subscription_updated",
  "subscription_canceled",
  "cdc_export_generated",
  "cdc_export_submitted",
  "cdc_crt_ingested",
  "cdc_identity_purged",
  "cdc_module_toggled",
  "cdc_settings_updated",
  "cdc_identity_upserted",
  "cdc_identity_deleted",
  "cdc_export_downloaded",
  "vc_offer_created",
  "vc_credential_issued",
  "transparency_report",
  "school_unfrozen",
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
  /** Legacy pre-V2 envelope blob: Ed25519 private key AES-256-GCM-encrypted at
      rest. New keys land in `signerRef` instead (V2 Signer seam); kept for schools
      approved before it, read as the envelope `ref` fallback. Never returned. */
  encryptedPrivateKey: text("encrypted_private_key"),
  /** Which signer backend holds THIS school's issuer key (v2.md §V2-1): 'envelope'
      (AES-GCM blob at rest, historical default) or 'kms' (key lives in a KMS/HSM;
      `signerRef` is the opaque key name). Coexist row-by-row — no data migration. */
  signerKind: text("signer_kind").notNull().default("envelope"),
  /** Opaque reference resolved by `resolveSchoolSigner`: the envelope-encrypted
      PKCS8 blob (kind 'envelope') or the KMS key name (kind 'kms'). Null on legacy
      'envelope' schools that predate V2 — their key is still read from
      `encryptedPrivateKey` (fallback), so no backfill is needed. */
  signerRef: text("signer_ref"),
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
  /** Set when the school flags a transparency-journal entry it did not issue
      (v2.md §V3-6): further issuance is blocked (fail 403) until a platform admin
      unfreezes. NOT a 6th status — verification of existing diplomas stays intact. */
  issuanceFrozenAt: timestamp("issuance_frozen_at", { withTimezone: true }),
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
    /** The student's durable, personal login identity (OTP target). Null until
        claimed: a diploma issuance creates the row before the holder ever proves
        control of a personal inbox — see `studentEmailAliases`. */
    email: text("email"),
    fullName: text("full_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Partial (WHERE email IS NOT NULL): many provisional (unclaimed) students
    // legitimately share the NULL email until each claims their own.
    emailIdx: uniqueIndex("students_email_idx")
      .on(sql`lower(${t.email})`)
      .where(sql`${t.email} is not null`),
  }),
);

/**
 * Binds a school-issued delivery address (only the school can reach the holder
 * there, and it may go stale once they leave) to a student identity, scoped per
 * school. Two lifecycles:
 *  - Pending (`verifiedAt` null): created at issuance alongside a provisional
 *    student (`students.email` null); `claimToken` is the one-time link mailed
 *    to `email` — while it's most likely still live — inviting the holder to
 *    bind a personal, durable login email.
 *  - Verified: the holder proved control of a personal email through this
 *    alias (`claim.service.ts`); further diplomas from the SAME school to the
 *    SAME address reuse it and attach directly, no re-claim needed.
 */
export const studentEmailAliases = pgTable(
  "student_email_aliases",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    claimToken: text("claim_token"),
    claimTokenExpiresAt: timestamp("claim_token_expires_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    schoolEmailIdx: uniqueIndex("student_email_aliases_school_email_idx").on(
      t.schoolId,
      sql`lower(${t.email})`,
    ),
    claimTokenIdx: uniqueIndex("student_email_aliases_claim_token_idx")
      .on(t.claimToken)
      .where(sql`${t.claimToken} is not null`),
  }),
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
  /** Proof engine version resolved PER diploma: 'v1' = ed25519-nonce-v1 (legacy,
      monolithic hash), 'v2' = ed25519-sd-v2 (salted per-field disclosures, RFC 9901).
      Existing diplomas stay 'v1' and keep verifying — never re-signed retroactively. */
  proofVersion: text("proof_version").notNull().default("v1"),
  /** v2 only: keyVault.encrypt(JSON) of the field→disclosure dict (all 7 fields,
      salts kept secret at rest so undisclosed low-entropy fields can't be brute-forced). */
  disclosuresEncrypted: text("disclosures_encrypted"),
  status: diplomaStatusEnum("status").notNull().default("active"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revocationReason: text("revocation_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // A v2 diploma MUST carry its (encrypted) disclosures — mirrors the SQL CHECK.
  v2NeedsDisclosures: check(
    "diplomas_v2_needs_disclosures",
    sql`${t.proofVersion} <> 'v2' OR ${t.disclosuresEncrypted} IS NOT NULL`,
  ),
}));

/** Per-school CDC certificateur configuration. CDC-issued identifiers stay
    nullable until the external administrative habilitation is complete. */
export const cdcSettings = pgTable(
  "cdc_settings",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    certificateurSiret: text("certificateur_siret").notNull(),
    contactEmail: text("contact_email"),
    emitterIdClient: text("emitter_id_client"),
    certificateurIdClient: text("certificateur_id_client"),
    contractId: text("contract_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    schoolIdUnique: uniqueIndex("cdc_settings_school_id_key").on(t.schoolId),
    certificateurSiretFormat: check(
      "cdc_settings_certificateur_siret_format",
      sql`${t.certificateurSiret} ~ '^[0-9]{14}$'`,
    ),
    emitterIdClientLength: check(
      "cdc_settings_emitter_id_client_length",
      sql`${t.emitterIdClient} is null or char_length(${t.emitterIdClient}) = 8`,
    ),
    certificateurIdClientLength: check(
      "cdc_settings_certificateur_id_client_length",
      sql`${t.certificateurIdClient} is null or char_length(${t.certificateurIdClient}) = 8`,
    ),
    contractIdLength: check(
      "cdc_settings_contract_id_length",
      sql`${t.contractId} is null or char_length(${t.contractId}) between 1 and 20`,
    ),
  }),
);

/** Sensitive CDC identity complement. The full validated NIR is encrypted;
    purge keeps the non-sensitive obtention method and provenance only. */
export const cdcIdentities = pgTable(
  "cdc_identities",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    diplomaId: uuid("diploma_id")
      .notNull()
      .references(() => diplomas.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    nirEncrypted: text("nir_encrypted"),
    birthLastName: text("birth_last_name"),
    obtentionMethod: cdcObtentionMethodEnum("obtention_method").notNull(),
    source: cdcIdentitySourceEnum("source").notNull(),
    purgeAfter: timestamp("purge_after", { withTimezone: true }),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    diplomaIdUnique: uniqueIndex("cdc_identities_diploma_id_key").on(t.diplomaId),
    schoolIdIdx: index("cdc_identities_school_id_idx").on(t.schoolId),
    purgeAfterIdx: index("cdc_identities_purge_after_idx")
      .on(t.purgeAfter)
      .where(sql`${t.purgeAfter} is not null and ${t.purgedAt} is null`),
  }),
);

/** Deterministic CDC XML export metadata. The XML itself is never persisted. */
export const cdcExports = pgTable(
  "cdc_exports",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    status: cdcExportStatusEnum("status").notNull().default("generated"),
    fileName: text("file_name").notNull(),
    fileSha256: text("file_sha256").notNull(),
    /** Immutable CDC configuration snapshot used for byte-identical regeneration. */
    emitterIdClient: text("emitter_id_client").notNull(),
    certificateurIdClient: text("certificateur_id_client").notNull(),
    contractId: text("contract_id").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    oneGeneratedPerSchool: uniqueIndex("cdc_exports_one_generated_per_school_idx")
      .on(t.schoolId)
      .where(sql`${t.status} = 'generated'`),
    schoolCreatedAtIdx: index("cdc_exports_school_created_at_idx").on(
      t.schoolId,
      t.createdAt.desc(),
    ),
    emitterIdClientLength: check(
      "cdc_exports_emitter_id_client_length_check",
      sql`char_length(${t.emitterIdClient}) = 8`,
    ),
    certificateurIdClientLength: check(
      "cdc_exports_certificateur_id_client_length_check",
      sql`char_length(${t.certificateurIdClient}) = 8`,
    ),
    contractIdLength: check(
      "cdc_exports_contract_id_length_check",
      sql`char_length(${t.contractId}) between 1 and 20`,
    ),
  }),
);

/** One diploma inside a CDC export. Rejected items may be resubmitted; pending
    and accepted items remain unique across all live/resolved exports. */
export const cdcExportItems = pgTable(
  "cdc_export_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    exportId: uuid("export_id")
      .notNull()
      .references(() => cdcExports.id, { onDelete: "cascade" }),
    diplomaId: uuid("diploma_id")
      .notNull()
      .references(() => diplomas.id, { onDelete: "restrict" }),
    status: cdcItemStatusEnum("status").notNull().default("pending"),
    rejectCode: text("reject_code"),
    rejectReason: text("reject_reason"),
  },
  (t) => ({
    exportDiplomaUnique: uniqueIndex("cdc_export_items_export_diploma_key").on(
      t.exportId,
      t.diplomaId,
    ),
    liveDiplomaUnique: uniqueIndex("cdc_export_items_live_diploma_key")
      .on(t.diplomaId)
      .where(sql`${t.status} <> 'rejected'`),
    exportIdIdx: index("cdc_export_items_export_id_idx").on(t.exportId),
  }),
);

/** Platform P-256 signing keys for SD-JWT VCs. Retired public keys remain
    available for verification; private JWKs are envelope-encrypted at rest. */
export const vcIssuerKeys = pgTable(
  "vc_issuer_keys",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    kid: text("kid").notNull(),
    alg: text("alg").notNull().default("ES256"),
    publicJwk: jsonb("public_jwk").$type<Record<string, unknown>>().notNull(),
    privateKeyEncrypted: text("private_key_encrypted").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    kidUnique: uniqueIndex("vc_issuer_keys_kid_key").on(t.kid),
    oneActive: uniqueIndex("vc_issuer_keys_one_active_idx")
      .on(t.status)
      .where(sql`${t.status} = 'active'`),
    algCheck: check("vc_issuer_keys_alg_check", sql`${t.alg} = 'ES256'`),
    statusCheck: check(
      "vc_issuer_keys_status_check",
      sql`${t.status} in ('active', 'retired')`,
    ),
  }),
);

/** Short-lived OpenID4VCI pre-authorized offers. Bearer material is hashed or
    encrypted; no pre-authorized code or tx_code is stored in plaintext. */
export const vcOffers = pgTable(
  "vc_offers",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    diplomaId: uuid("diploma_id")
      .notNull()
      .references(() => diplomas.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    preAuthCodeHash: text("pre_auth_code_hash").notNull(),
    txCodeHash: text("tx_code_hash").notNull(),
    txAttempts: integer("tx_attempts").notNull().default(0),
    /** Encrypted complete Credential Offer; it embeds the bearer pre-auth code. */
    offerPayloadEncrypted: text("offer_payload_encrypted").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    credentialIssuedAt: timestamp("credential_issued_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    preAuthCodeHashUnique: uniqueIndex("vc_offers_pre_auth_code_hash_key").on(
      t.preAuthCodeHash,
    ),
    studentIdIdx: index("vc_offers_student_id_idx").on(t.studentId),
    expiresAtIdx: index("vc_offers_expires_at_idx").on(t.expiresAt),
    txAttemptsCheck: check("vc_offers_tx_attempts_check", sql`${t.txAttempts} >= 0`),
  }),
);

/** Minimal issuance ledger. SD-JWTs and disclosures are intentionally absent;
    these fields are sufficient to derive Token Status Lists at read time. */
export const vcCredentials = pgTable(
  "vc_credentials",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    diplomaId: uuid("diploma_id")
      .notNull()
      .references(() => diplomas.id, { onDelete: "restrict" }),
    offerId: uuid("offer_id")
      .notNull()
      .references(() => vcOffers.id, { onDelete: "restrict" }),
    statusListId: integer("status_list_id").notNull().default(1),
    statusListIndex: integer("status_list_index").notNull(),
    cnfJkt: text("cnf_jkt").notNull(),
    vct: text("vct").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    offerIdUnique: uniqueIndex("vc_credentials_offer_id_key").on(t.offerId),
    statusListPositionUnique: uniqueIndex("vc_credentials_status_list_position_key").on(
      t.statusListId,
      t.statusListIndex,
    ),
    diplomaIdIdx: index("vc_credentials_diploma_id_idx").on(t.diplomaId),
    statusListIdIdx: index("vc_credentials_status_list_id_idx").on(t.statusListId),
    statusListIdCheck: check(
      "vc_credentials_status_list_id_check",
      sql`${t.statusListId} > 0`,
    ),
    statusListIndexCheck: check(
      "vc_credentials_status_list_index_check",
      sql`${t.statusListIndex} >= 0`,
    ),
  }),
);

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
  /** Fields the holder agreed to reveal to THIS recruiter (chosen at link creation).
      Default reproduces the historical fixed disclosure of verify.routes.ts. Only
      meaningful for v2 diplomas; ignored for legacy v1. */
  disclosedFields: text("disclosed_fields")
    .array()
    .notNull()
    .default(["holderName", "programTitle", "mention", "rncp", "issuedAt"]),
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

/**
 * Public issuance log (v2.md §V3-1): one append-only leaf per issued diploma.
 * The leaf commits to `{diplomaId, schoolId, payloadHash, signature, issuedAt}`
 * ONLY — zero PII, since the log is world-readable. `leaf_index` is assigned
 * inside the issuance transaction under an advisory lock (contiguous, gap-free),
 * NOT by a sequence (see constants TRANSPARENCY / design D1).
 */
export const issuanceLog = pgTable("issuance_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  diplomaId: uuid("diploma_id")
    .notNull()
    .unique()
    .references(() => diplomas.id),
  /** Contiguous position in the Merkle tree (assigned under advisory lock). */
  leafIndex: bigint("leaf_index", { mode: "number" }).notNull().unique(),
  /** Hex RFC 6962 leaf hash (SHA-256(0x00 ‖ canonical leaf)). */
  leafHash: text("leaf_hash").notNull(),
  /** Set when the issuing school flags this as an issuance it did not make. */
  reportedAt: timestamp("reported_at", { withTimezone: true }),
  reportedReason: text("reported_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  leafIndexPositive: check("issuance_log_leaf_index_positive", sql`${t.leafIndex} >= 0`),
}));

/**
 * Signed checkpoints (Signed Tree Heads) of the issuance log (v2.md §V3-1). The
 * CertifyChain PKI root signs `{treeSize, rootHash, timestamp}`; `timestamp` is
 * `created_at` (stored explicitly so it equals exactly what was signed). The
 * detached OpenTimestamps proof lands in `ots_proof` and is later upgraded with a
 * Bitcoin attestation (`ots_upgraded_at`); never claim "anchored" before that.
 */
export const logCheckpoints = pgTable("log_checkpoints", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  treeSize: bigint("tree_size", { mode: "number" }).notNull(),
  rootHash: text("root_hash").notNull(),
  signature: text("signature").notNull(),
  otsProof: bytea("ots_proof"),
  otsUpgradedAt: timestamp("ots_upgraded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  treeSizePositive: check("log_checkpoints_tree_size_positive", sql`${t.treeSize} >= 0`),
}));

/* ── Inferred types ─────────────────────────────────────────────────────── */

export type School = typeof schools.$inferSelect;
export type NewSchool = typeof schools.$inferInsert;
export type SchoolAdmin = typeof schoolAdmins.$inferSelect;
export type PlatformAdmin = typeof platformAdmins.$inferSelect;
export type NewPlatformAdmin = typeof platformAdmins.$inferInsert;
export type PlatformSettings = typeof platformSettings.$inferSelect;
export type Student = typeof students.$inferSelect;
export type StudentEmailAlias = typeof studentEmailAliases.$inferSelect;
export type Diploma = typeof diplomas.$inferSelect;
export type NewDiploma = typeof diplomas.$inferInsert;
export type CdcSettings = typeof cdcSettings.$inferSelect;
export type NewCdcSettings = typeof cdcSettings.$inferInsert;
export type CdcIdentity = typeof cdcIdentities.$inferSelect;
export type NewCdcIdentity = typeof cdcIdentities.$inferInsert;
export type CdcExport = typeof cdcExports.$inferSelect;
export type NewCdcExport = typeof cdcExports.$inferInsert;
export type CdcExportItem = typeof cdcExportItems.$inferSelect;
export type NewCdcExportItem = typeof cdcExportItems.$inferInsert;
export type VcIssuerKey = typeof vcIssuerKeys.$inferSelect;
export type NewVcIssuerKey = typeof vcIssuerKeys.$inferInsert;
export type VcOffer = typeof vcOffers.$inferSelect;
export type NewVcOffer = typeof vcOffers.$inferInsert;
export type VcCredential = typeof vcCredentials.$inferSelect;
export type NewVcCredential = typeof vcCredentials.$inferInsert;
export type ShareLink = typeof shareLinks.$inferSelect;
export type VerificationNonce = typeof verificationNonces.$inferSelect;
export type OtpCode = typeof otpCodes.$inferSelect;
export type RefreshSession = typeof refreshSessions.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
export type SchoolVerification = typeof schoolVerifications.$inferSelect;
export type NewSchoolVerification = typeof schoolVerifications.$inferInsert;
export type IssuanceLogEntry = typeof issuanceLog.$inferSelect;
export type NewIssuanceLogEntry = typeof issuanceLog.$inferInsert;
export type LogCheckpoint = typeof logCheckpoints.$inferSelect;
export type NewLogCheckpoint = typeof logCheckpoints.$inferInsert;
