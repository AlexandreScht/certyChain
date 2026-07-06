import type {
  DiplomaStatus,
  Role,
  SchoolPlan,
  SchoolStatus,
  VerificationMethod,
  VerificationResult,
  VerificationStatus,
} from "./enums";

/** Response payloads (the API builds these; the web imports them `type`-only). */

export interface SessionDTO {
  role: Role;
  sub: string;
  email: string;
  schoolId?: string;
  schoolStatus?: SchoolStatus;
}

export interface SchoolDTO {
  id: string;
  name: string;
  status: SchoolStatus;
  contactEmail: string | null;
  hasKeys: boolean;
  createdAt: string;
  approvedAt: string | null;
}

export interface SchoolStatsDTO {
  totalDiplomas: number;
  activeDiplomas: number;
  revokedDiplomas: number;
  verifications: number;
  lastIssuedAt: string | null;
}

export interface DiplomaDTO {
  id: string;
  schoolName: string;
  holderName: string;
  holderEmail: string;
  programTitle: string;
  mention: string | null;
  /** RNCP code of the certified title (per-diploma, optional). */
  rncp: string | null;
  issuedAt: string;
  externalId: string | null;
  status: DiplomaStatus;
  createdAt: string;
  revokedAt: string | null;
  revocationReason: string | null;
}

export interface DiplomaListDTO {
  items: DiplomaDTO[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Public info shown on the wallet claim landing page (`/claim/:token`), before
 * the holder proves control of a personal email. Never carries the holder's
 * full delivery address (masked) or anything not already implied by having
 * received the claim link in their inbox.
 */
export interface ClaimInfoDTO {
  status: "pending" | "claimed" | "expired" | "not_found";
  schoolName: string | null;
  diplomaCount: number;
  /** School-issued address the diploma was addressed to, partially masked. */
  maskedEmail: string | null;
}

export interface WalletDiplomaDTO {
  id: string;
  schoolName: string;
  programTitle: string;
  mention: string | null;
  rncp: string | null;
  issuedAt: string;
  status: DiplomaStatus;
}

export interface ShareLinkDTO {
  token: string;
  url: string;
  expiresAt: string | null;
  revoked: boolean;
  createdAt: string;
}

export interface VerificationChallengeDTO {
  nonce: string;
  expiresAt: string;
}

/** What the recruiter sees — minimal disclosure, no document content. */
export interface VerificationResultDTO {
  result: VerificationResult;
  engine: string;
  diploma?: {
    holderName: string;
    programTitle: string;
    mention: string | null;
    rncp: string | null;
    issuedAt: string;
    schoolName: string;
    issuerCertificateValid: boolean;
  };
}

export interface ImportResultDTO {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

/* ── Ownership verification (verify.md) ───────────────────────────────────── */

/** Whether a given proof method is offerable to this school, and why not. */
export interface VerificationMethodInfo {
  method: VerificationMethod;
  available: boolean;
  /** Human-readable reason when `available` is false (else null). */
  reason: string | null;
}

/** DNS-TXT instructions the school must publish (token is not secret). */
export interface DnsChallengeDTO {
  recordName: string;
  recordType: "TXT";
  recordValue: string;
}

/** Postal proof state — only a PARTIAL address is ever exposed (security). */
export interface PostalChallengeDTO {
  /** Partial address for identification (no full street name disclosed). */
  streetNo: string | null;
  postalCode: string | null;
  city: string | null;
  paymentStatus: "unpaid" | "paid";
  priceLabel: string;
  /** Max delivery delay (no precise ETA is ever communicated). */
  maxDeliveryDays: number;
  /** Stripe Checkout URL to pay the dispatch fee (null once paid). */
  checkoutUrl: string | null;
}

/** The school's current (in-progress) verification attempt, if any. */
export interface CurrentVerificationDTO {
  method: VerificationMethod;
  status: VerificationStatus;
  createdAt: string;
  dns: DnsChallengeDTO | null;
  postal: PostalChallengeDTO | null;
}

/** Full ownership-verification state for the school portal. */
export interface VerificationStateDTO {
  schoolStatus: SchoolStatus;
  /** True while the school is `provisional` (must prove ownership to emit). */
  needsOwnershipProof: boolean;
  methods: VerificationMethodInfo[];
  current: CurrentVerificationDTO | null;
}

/** Returned by the ProConnect start endpoint — the URL to redirect the browser. */
export interface ProConnectStartDTO {
  authorizeUrl: string;
}

/* ── Billing (cahier des charges §5.1) ──────────────────────────────────────── */

/** One offer in the pricing table — static, not persisted. */
export interface BillingPlanInfo {
  id: SchoolPlan;
  label: string;
  /** e.g. "49 €/mois" — display only, the real price lives in Stripe. */
  priceLabel: string;
  target: string;
  features: string[];
  /** True for Starter/Pro (Stripe Checkout); false for Enterprise (contact-sales). */
  selfServe: boolean;
  /** False when this plan's Stripe Price isn't configured server-side yet. */
  available: boolean;
}

/** The school's current billing state + the offers it can see. */
export interface BillingStateDTO {
  currentPlan: SchoolPlan | null;
  /** Raw Stripe subscription status (active/trialing/past_due/canceled/…), or
      null before any subscription. */
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  /** True once the school has a Stripe customer (unlocks the Billing Portal). */
  hasStripeCustomer: boolean;
  plans: BillingPlanInfo[];
}

/** Returned by the checkout/portal start endpoints — redirect the browser here. */
export interface BillingRedirectDTO {
  url: string;
}

/* ── MFA / Admin ──────────────────────────────────────────────────────────── */

/** Returned by the first login step when MFA is required. */
export interface MfaChallengeDTO {
  mfaStage: "enroll" | "verify";
  /** otpauth:// URI for the authenticator app — present only on first enrollment. */
  otpauthUri?: string;
  /** Base32 shared secret (manual entry fallback) — present only on first enrollment. */
  secret?: string;
}

export interface AdminSessionDTO {
  role: "admin";
  sub: string;
  email: string;
  fullName: string | null;
}

export interface AdminAuditEntryDTO {
  id: string;
  type: string;
  result: string | null;
  schoolId: string | null;
  schoolName: string | null;
  diplomaId: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

export interface AdminStatsDTO {
  schools: {
    total: number;
    pending: number;
    /** Existence confirmed, ownership proof pending (verify.md). */
    provisional: number;
    approved: number;
    rejected: number;
    revoked: number;
  };
  diplomas: { total: number; active: number; revoked: number };
  students: number;
  verifications: number;
  recentActivity: AdminAuditEntryDTO[];
}

/** One at-a-glance validation signal shown beside the AI score (admin). */
export type ValidationSignalStatus = "good" | "warn" | "bad";
export interface ValidationSignal {
  /** Short label, e.g. "SIRENE vérifié", "Nom concordant", "Ville différente". */
  label: string;
  status: ValidationSignalStatus;
}

export interface AdminSchoolListItemDTO {
  id: string;
  name: string;
  status: SchoolStatus;
  siret: string | null;
  contactEmail: string | null;
  validationScore: number | null;
  autoValidated: boolean;
  sireneVerified: boolean | null;
  diplomaCount: number;
  createdAt: string;
  approvedAt: string | null;
}

export interface AdminSchoolListDTO {
  items: AdminSchoolListItemDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminSchoolDetailDTO {
  id: string;
  name: string;
  status: SchoolStatus;
  siret: string | null;
  /** UAI / RNE — official establishment id (optional trust signal). */
  uai: string | null;
  /** Declared city (cross-checked against the official SIRENE commune). */
  city: string | null;
  /** Official domain CONFIRMED by a live web-search-grounded AI check — the
      only signal that unlocks the "dns" ownership-proof method (verify.md). */
  verifiedOfficialDomain: string | null;
  contactEmail: string | null;
  hasKeys: boolean;
  validationScore: number | null;
  validationReasoning: string | null;
  validationModel: string | null;
  validatedAt: string | null;
  autoValidated: boolean;
  sireneVerified: boolean | null;
  sireneLegalName: string | null;
  /** Concise "what's good / what's off" breakdown behind the AI score. */
  validationSignals: ValidationSignal[] | null;
  statusReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  reviewedAt: string | null;
  admins: {
    id: string;
    email: string;
    fullName: string | null;
    lastLoginAt: string | null;
  }[];
  stats: SchoolStatsDTO;
  recentAudit: AdminAuditEntryDTO[];
}

export interface PlatformSettingsDTO {
  autoValidateEnabled: boolean;
  autoValidateMinScore: number;
  /** Destination for "new school to review" notifications. */
  notifyEmail: string;
  /** True when a Gemini API key is configured server-side. */
  geminiConfigured: boolean;
  geminiModel: string;
  /** True when the INSEE SIRENE API key is configured server-side. */
  inseeConfigured: boolean;
  updatedAt: string | null;
}
