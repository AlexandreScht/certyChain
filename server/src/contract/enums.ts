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
