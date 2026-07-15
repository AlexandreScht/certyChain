/** Shared enums (single source of truth for both API and web). */

export const VERIFICATION_RESULTS = [
  "verified",
  "not_found",
  "revoked",
  "expired",
  "invalid",
] as const;
export type VerificationResult = (typeof VERIFICATION_RESULTS)[number];

export const DIPLOMA_STATUS = ["active", "revoked"] as const;
export type DiplomaStatus = (typeof DIPLOMA_STATUS)[number];

/**
 * The 7 selectively disclosable diploma fields (v2.md §V1-2). Fixed and public:
 * `id`/`schoolId` stay permanently visible and are NOT in this list. The holder
 * picks a subset of these at share time; anything else is a validation error.
 */
export const DISCLOSABLE_FIELDS = [
  "holderName",
  "holderEmail",
  "programTitle",
  "mention",
  "rncp",
  "issuedAt",
  "externalId",
] as const;
export type DisclosableField = (typeof DISCLOSABLE_FIELDS)[number];

/** Default disclosed set = the historical fixed disclosure of verify.routes.ts
    (mirrors the `share_links.disclosed_fields` column default). */
export const DEFAULT_DISCLOSED_FIELDS = [
  "holderName",
  "programTitle",
  "mention",
  "rncp",
  "issuedAt",
] as const satisfies readonly DisclosableField[];

export const SCHOOL_STATUS = [
  "pending",
  "provisional",
  "approved",
  "rejected",
  "revoked",
] as const;
export type SchoolStatus = (typeof SCHOOL_STATUS)[number];

/** Ownership-proof methods a provisional school can use to reach `approved`. */
export const VERIFICATION_METHODS = ["dns", "postal", "proconnect"] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

/** Lifecycle of a single ownership-verification attempt. */
export const VERIFICATION_STATUSES = [
  "pending",
  "awaiting_payment",
  "code_sent",
  "verified",
  "failed",
  "cancelled",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export type Role = "school_admin" | "student" | "admin";

/** Subscription tier (cahier des charges §5.1). Starter/Pro are self-serve
    (Stripe Checkout); Enterprise is contact-sales (custom pricing/SLA). */
export const SCHOOL_PLANS = ["starter", "pro", "enterprise"] as const;
export type SchoolPlan = (typeof SCHOOL_PLANS)[number];
/** Plans purchasable via self-serve Stripe Checkout (Enterprise = contact-sales). */
export const SELF_SERVE_PLANS = ["starter", "pro"] as const;
export type SelfServePlan = (typeof SELF_SERVE_PLANS)[number];

/* ── Accrochage CDC (Passeport de compétences) ─────────────────────────── */

export const CDC_EXPORT_STATUSES = [
  "generated",
  "submitted",
  "accepted",
  "partially_rejected",
  "rejected",
  "cancelled",
] as const;
export type CdcExportStatus = (typeof CDC_EXPORT_STATUSES)[number];

export const CDC_ITEM_STATUSES = ["pending", "accepted", "rejected"] as const;
export type CdcItemStatus = (typeof CDC_ITEM_STATUSES)[number];

export const CDC_IDENTITY_SOURCES = ["csv", "form"] as const;
export type CdcIdentitySource = (typeof CDC_IDENTITY_SOURCES)[number];

/** Values accepted by the official CDC 2026 XSD for `obtentionCertification`. */
export const CDC_OBTENTION_METHODS = ["PAR_ADMISSION", "PAR_SCORING"] as const;
export type CdcObtentionMethod = (typeof CDC_OBTENTION_METHODS)[number];
