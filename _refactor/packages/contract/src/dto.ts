import type {
  CdcExportStatus,
  CdcItemStatus,
  CdcObtentionMethod,
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
  /** Server-computed gate: feature enabled, issuer key active, diploma active,
      and issuing school still approved. */
  eudiExportAvailable: boolean;
}

/** Short-lived OpenID4VCI offer shown to the authenticated diploma holder. */
export interface EudiOfferDTO {
  offerDeepLink: string;
  txCode: string;
  expiresAt: string;
}

export interface ShareLinkDTO {
  token: string;
  url: string;
  expiresAt: string | null;
  revoked: boolean;
  createdAt: string;
  /** Fields the holder chose to reveal via this link (v2 selective disclosure). */
  disclosedFields: string[];
}

/** Paginated `GET /wallet/diplomas/:id/shares` (R4, audit 2026-07-28) — same
 *  shape as the admin list DTOs (`AdminSchoolListDTO` et al.). */
export interface ShareLinkListDTO {
  items: ShareLinkDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface VerificationChallengeDTO {
  nonce: string;
  expiresAt: string;
}

/**
 * The `ed25519-sd-v2` / `ed25519-sd-v3` signed object (only id/schoolId
 * visible; fields → digests). `v: "sd-v3"` (v2.md §V4-1) is the SAME shape as
 * `"sd-v2"` — it only marks that the diploma ALSO carries a post-quantum
 * ML-DSA-65 signature (`ProofBundleDTO.signaturePq`) over this same payload.
 */
export interface SdPayloadDTO {
  v: "sd-v2" | "sd-v3";
  h: "sha-256";
  id: string;
  schoolId: string;
  /** Salted per-field digests, sorted lexicographically. */
  _sd: string[];
}

/**
 * A signed checkpoint (STH) of the public issuance log (v2.md §V3-1): the
 * CertifyChain PKI root signs `{treeSize, rootHash, timestamp}`. Anchoring is
 * asynchronous (OpenTimestamps → Bitcoin, a few hours): `otsAnchored` only
 * turns true once the proof is upgraded — never claim "anchored" before.
 */
export interface LogCheckpointDTO {
  treeSize: number;
  /** Hex RFC 6962 Merkle root of the issuance log at `treeSize`. */
  rootHash: string;
  timestamp: string;
  /** Base64 — the CertifyChain root signs {treeSize, rootHash, timestamp}. */
  signature: string;
  /** Base64 ML-DSA-65 root signature of the SAME {treeSize, rootHash,
   *  timestamp} message (v2.md §V4-1) — present only once `PQ_POLICY` is
   *  enabled server-side; absent/undefined for checkpoints signed before that
   *  (non-regression: they keep verifying Ed25519-only, exactly as before). */
  signaturePq?: string;
  otsAnchored: boolean;
  otsUpgradedAt: string | null;
  /** Base64 detached `.ots` proof, null until anchored in a Bitcoin block. */
  otsProof: string | null;
}

/** RFC 6962 inclusion proof tying one issuance-log leaf to a signed checkpoint. */
export interface TransparencyProofDTO {
  leafIndex: number;
  /** Hex RFC 6962 leaf hash (SHA-256(0x00 ‖ canonical leaf) — no PII by construction). */
  leafHash: string;
  /** Hex audit path (RFC 6962 §2.1.1), leaf and root excluded. */
  auditPath: string[];
  checkpoint: LogCheckpointDTO;
}

/**
 * RFC 6962 consistency proof (`GET /log/consistency`): lets a third party check
 * that the tree at `toSize` is an append-only extension of the tree at `fromSize`
 * (no leaf was ever removed or rewritten). All values are public hex — zero PII.
 */
export interface LogConsistencyDTO {
  fromSize: number;
  toSize: number;
  /** Hex RFC 6962 root at `fromSize`. */
  fromRoot: string;
  /** Hex RFC 6962 root at `toSize`. */
  toRoot: string;
  /** Hex consistency proof (RFC 6962 §2.1.2). */
  proof: string[];
}

/**
 * A self-contained v2 proof (v2.md §V1-2): everything a recruiter needs to verify
 * a diploma OFFLINE in their own browser — the signed payload, the school's
 * Ed25519 signature, ONLY the disclosures the holder chose, the school
 * certificate + PKI root to chain trust, and a point-in-time revocation snapshot.
 * `disclosures` carries base64url `[salt, name, value]` triples; hidden fields
 * appear only as opaque digests in `payload._sd`, never as values.
 */
export interface ProofBundleDTO {
  /** `"ed25519-sd-v3"` (v2.md §V4-1) is `"ed25519-sd-v2"` PLUS a mandatory
   *  post-quantum ML-DSA-65 signature — hybrid "AND", never "OR". Existing v2
   *  bundles keep the literal they always had; nothing about them changes. */
  engine: "ed25519-sd-v2" | "ed25519-sd-v3";
  payload: SdPayloadDTO;
  /** Base64 Ed25519 signature (by the school) of the SHA-256 of the payload. */
  signature: string;
  /** Base64 ML-DSA-65 signature (by the school) of the SAME SHA-256 of the
   *  payload (v2.md §V4-1) — present only for `payload.v === "sd-v3"`. A v3
   *  bundle missing this, or whose value fails to verify, is REJECTED: both
   *  signatures must hold, hybrid "AND". Absent/undefined for v2 bundles. */
  signaturePq?: string;
  /** Only the fields the holder disclosed to this recruiter. */
  disclosures: string[];
  school: {
    id: string;
    name: string;
    /** SPKI PEM. */
    publicKey: string;
    /** Base64 — CertifyChain root signs {schoolId, publicKey, name, issuedAt}. */
    certificate: string;
    certIssuedAt: string;
    /** Base64 raw ML-DSA-65 public key of the school (v2.md §V4-1) — v3 only. */
    publicKeyPq?: string;
    /** Base64 — CertifyChain root ML-DSA-65 signature over the SAME-SHAPE
     *  certificate payload {schoolId, publicKey: publicKeyPq, name, issuedAt}
     *  (same canonical form as `certificate`, different key material) — v3 only. */
    certificatePq?: string;
  };
  root: {
    /** SPKI PEM of the CertifyChain PKI root. */
    publicKey: string;
    /** Base64 raw ML-DSA-65 public key of the CertifyChain PKI root — v3 only. */
    publicKeyPq?: string;
  };
  revocation: {
    checkedAt: string;
    status: "active" | "revoked";
    /** Public URL to re-check revocation independently of the share link. */
    source: string;
  };
  /** Public issuance-log inclusion proof (v2.md §V3-4). Absent/null = diploma
      issued before the transparency log. */
  transparency?: TransparencyProofDTO | null;
}

/* ── Transparency log — school journal (v2.md §V3-6) ─────────────────────── */

/**
 * One row of a school's own issuance journal (authenticated portal, so full PII
 * on the school's OWN diplomas is fine — unlike the public log leaf, which is PII-free).
 */
export interface SchoolJournalEntryDTO {
  leafIndex: number;
  diplomaId: string;
  holderName: string;
  programTitle: string;
  issuedAt: string;
  /** When the issuance was appended to the public transparency log. */
  loggedAt: string;
  /** Set once the school flagged this entry as an issuance it did not make. */
  reportedAt: string | null;
}

export interface SchoolJournalDTO {
  items: SchoolJournalEntryDTO[];
  total: number;
  page: number;
  pageSize: number;
  /** Non-null once the school reported a rogue entry: issuance is suspended
      until a platform admin unfreezes (verification of existing diplomas is intact). */
  issuanceFrozenAt: string | null;
}

/** Result of flagging a journal entry the school did not issue. */
export interface ReportJournalResultDTO {
  ok: true;
  issuanceFrozenAt: string;
}

/** What the recruiter sees — minimal disclosure, no document content. */
export interface VerificationResultDTO {
  result: VerificationResult;
  engine: string;
  /** Legacy v1 minimal disclosure (fixed fields). Absent for v2. */
  diploma?: {
    holderName: string;
    programTitle: string;
    mention: string | null;
    rncp: string | null;
    issuedAt: string;
    schoolName: string;
    issuerCertificateValid: boolean;
  };
  /** v2 selective disclosure: the offline-verifiable bundle. Null for v1. */
  proofBundle: ProofBundleDTO | null;
  /** v2: field→value map DERIVED from the verified bundle (only disclosed fields). */
  disclosed?: Record<string, unknown>;
  /** v2: number of fields the holder kept hidden. */
  hiddenCount?: number;
}

export interface ImportResultDTO {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

/**
 * Public revocation oracle response (`GET /verify/revocation/:id`). Only ACTIVE
 * diplomas return 200; revoked AND unknown ids both return a uniform 404
 * (anti-enumeration — a holder of a valid bundle reads a 404 as "revoked").
 */
export interface RevocationStatusDTO {
  status: "active" | "revoked";
  checkedAt: string;
}

/* ── Accrochage CDC (Passeport de compétences) ───────────────────────────── */

export interface CdcSettingsDTO {
  enabled: boolean;
  certificateurSiret: string;
  contactEmail: string | null;
  /** CDC-issued 8-character identifier of the XML emitter. */
  emitterIdClient: string | null;
  /** CDC-issued 8-character identifier of the certificateur. */
  certificateurIdClient: string | null;
  /** Contract identifier assigned by the CDC (1–20 characters). */
  contractId: string | null;
}

export interface CdcEligibleDiplomaDTO {
  id: string;
  holderName: string;
  programTitle: string;
  /** Eligible rows always carry an RNCP code. */
  rncp: string;
  issuedAt: string;
  identityComplete: boolean;
  inFlight: boolean;
}

export interface CdcExportCountsDTO {
  total: number;
  accepted: number;
  rejected: number;
  pending: number;
}

export interface CdcExportDTO {
  id: string;
  status: CdcExportStatus;
  fileName: string;
  fileSha256: string;
  generatedAt: string;
  submittedAt: string | null;
  resolvedAt: string | null;
  counts: CdcExportCountsDTO;
}

export interface CdcExportItemDTO {
  diplomaId: string;
  holderName: string;
  programTitle: string;
  status: CdcItemStatus;
  rejectCode: string | null;
  rejectReason: string | null;
}

export interface CdcExportDetailDTO extends CdcExportDTO {
  items: CdcExportItemDTO[];
}

export interface CdcExportListDTO {
  items: CdcExportDTO[];
  total: number;
  page: number;
  pageSize: number;
}

/** Per-line CSV outcome. Sensitive identity values are deliberately absent. */
export interface CdcIdentityImportResultDTO {
  imported: number;
  errors: { line: number; message: string }[];
}

/** Safe summary usable by identity forms without ever returning a NIR. */
export interface CdcIdentitySummaryDTO {
  diplomaId: string;
  identityComplete: boolean;
  obtentionMethod: CdcObtentionMethod;
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
  /** Activation du module réglementaire France Compétences, contrôlée par la plateforme. */
  cdcEnabled: boolean;
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
  /** Non-null when issuance is frozen following a transparency-journal report
      (v2.md §V3-6) — an admin can lift it with POST /admin/schools/:id/unfreeze. */
  issuanceFrozenAt: string | null;
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
