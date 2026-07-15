import { z } from "zod";
import { CDC_UPLOAD_LIMITS } from "./constants";
import { CDC_OBTENTION_METHODS, DISCLOSABLE_FIELDS } from "./enums";

/* ── Reusable primitives ────────────────────────────────────────────────── */

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(12, "12 caractères minimum").max(200);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ");

/* ── Auth ───────────────────────────────────────────────────────────────── */

export const SchoolLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export const RegisterSchoolSchema = z.object({
  name: z.string().trim().min(2).max(160),
  siret: z.string().trim().regex(/^\d{14}$/, "SIRET = 14 chiffres"),
  // UAI / RNE — official establishment identifier (7 digits + 1 letter, e.g. 0751234A).
  // Optional; when present, used as a positive trust signal during AI scoring.
  uai: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^\d{7}[A-Z]$/, "UAI = 7 chiffres + 1 lettre (ex. 0751234A)")
    .optional(),
  // City the establishment is located in — optional; when present it's cross-checked
  // against the official SIRENE commune to help confirm WHICH school it is.
  city: z.string().trim().min(2).max(120).optional(),
  contactEmail: emailSchema,
  adminEmail: emailSchema,
  adminPassword: passwordSchema,
  adminFullName: z.string().trim().max(120).optional(),
});

export const RequestOtpSchema = z.object({ email: emailSchema });

/** Landing waitlist — a prospect school leaves its contact email. */
export const WaitlistSchema = z.object({ email: emailSchema });

export const VerifyOtpSchema = z.object({
  email: emailSchema,
  code: z.string().trim().regex(/^\d{6}$/, "Code à 6 chiffres"),
});

/* ── Diplomas ───────────────────────────────────────────────────────────── */

export const CreateDiplomaSchema = z.object({
  holderName: z.string().trim().min(2).max(160),
  holderEmail: emailSchema,
  programTitle: z.string().trim().min(2).max(200),
  mention: z.string().trim().max(80).optional(),
  issuedAt: isoDate,
  externalId: z.string().trim().max(80).optional(),
  // RNCP code of the specific certified title (one per program, optional —
  // many schools issue diplômes d'établissement that have no RNCP listing).
  rncp: z.string().trim().max(40).optional(),
});

export const CsvDiplomaRowSchema = CreateDiplomaSchema;

export const ListDiplomasQuerySchema = z.object({
  status: z.enum(["active", "revoked"]).optional(),
  year: z.coerce.number().int().min(1990).max(2100).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const RevokeDiplomaSchema = z.object({
  reason: z.string().trim().max(280).optional(),
});

/* ── Accrochage CDC (Passeport de compétences) ─────────────────────────── */

const cdcIdClientSchema = z.string().trim().length(8, "Identifiant client CDC = 8 caractères");
const cdcContractIdSchema = z.string().trim().min(1).max(20);

export const UpdateCdcSettingsSchema = z.object({
  certificateurSiret: z.string().trim().regex(/^\d{14}$/, "SIRET = 14 chiffres"),
  contactEmail: emailSchema.nullable(),
  emitterIdClient: cdcIdClientSchema.nullable(),
  certificateurIdClient: cdcIdClientSchema.nullable(),
  contractId: cdcContractIdSchema.nullable(),
});

export const CdcIdentityFormSchema = z.object({
  diplomaId: z.string().uuid(),
  // Strong checksum validation and normalization deliberately stay server-side.
  nir: z.string().trim().min(13).max(20),
  birthLastName: z.string().trim().min(1).max(60),
  obtentionMethod: z.enum(CDC_OBTENTION_METHODS),
});

export const CreateCdcExportSchema = z.object({
  diplomaIds: z
    .array(z.string().uuid())
    .min(1, "Sélectionnez au moins un diplôme")
    .max(500, "Un lot CDC ne peut pas dépasser 500 diplômes")
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Un même diplôme ne peut apparaître qu'une fois dans le lot",
    }),
});

/** Phase B CRT payload. The transport also enforces a byte-oriented body cap. */
export const CdcCrtUploadSchema = z.object({
  content: z
    .string()
    .min(1, "Compte rendu CDC vide")
    .max(CDC_UPLOAD_LIMITS.crt, "Compte rendu CDC trop volumineux (max 2 Mo)")
    .refine((content) => content.trim().length > 0, "Compte rendu CDC vide"),
});

export const ListCdcExportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Platform-admin activation switch; certificateur data is edited separately. */
export const SetCdcModuleEnabledSchema = z.object({ enabled: z.boolean() });

/* ── Wallet / share ─────────────────────────────────────────────────────── */

export const CreateShareLinkSchema = z.object({
  /** Number of days until expiry, or null for a permanent link. */
  expiresInDays: z.number().int().min(1).max(365).nullable().default(null),
  /**
   * The v2 fields the holder agrees to reveal to this recruiter. Validated against
   * the fixed whitelist of 7 (any other name → fail.validation); duplicates are
   * rejected. Omitted ⇒ the server applies the default disclosed set. Ignored for
   * legacy v1 diplomas.
   */
  disclosedFields: z
    .array(z.enum(DISCLOSABLE_FIELDS))
    .min(1, "Sélectionnez au moins un champ à révéler")
    .refine((fields) => new Set(fields).size === fields.length, {
      message: "Un même champ ne peut apparaître qu'une fois",
    })
    .optional(),
});

/* ── Public verification ────────────────────────────────────────────────── */

export const VerifyProofSchema = z.object({
  nonce: z.string().min(10).max(200),
});

/* ── Transparency log (v2.md §V3) ───────────────────────────────────────── */

/** Public consistency-proof query: 1 ≤ from ≤ to (upper bound checked server-side
    against the current tree size). Coerced from the query string. */
export const LogConsistencyQuerySchema = z
  .object({
    from: z.coerce.number().int().min(1),
    to: z.coerce.number().int().min(1),
  })
  .refine((v) => v.from <= v.to, {
    message: "from doit être ≤ to",
    path: ["from"],
  });

/** School journal listing (authenticated school portal). */
export const ListJournalQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Flag an issuance the school did not make (freezes further issuance). */
export const ReportJournalEntrySchema = z.object({
  diplomaId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

/* ── Ownership verification (verify.md) ─────────────────────────────────── */

export const ChooseVerificationMethodSchema = z.object({
  method: z.enum(["dns", "postal", "proconnect"]),
});

export const SubmitPostalCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Code à 6 chiffres"),
});

/** ProConnect OIDC callback query (state is our anti-CSRF lookup key). */
export const ProConnectCallbackSchema = z.object({
  code: z.string().min(1).max(2048),
  state: z.string().min(1).max(256),
});

/* ── Billing (cahier des charges §5.1) ───────────────────────────────────── */

// Enterprise deliberately excluded — contact-sales only, no self-serve checkout.
export const StartCheckoutSchema = z.object({
  plan: z.enum(["starter", "pro"]),
});

export type ChooseVerificationMethodInput = z.infer<typeof ChooseVerificationMethodSchema>;
export type SubmitPostalCodeInput = z.infer<typeof SubmitPostalCodeSchema>;
export type ProConnectCallbackQuery = z.infer<typeof ProConnectCallbackSchema>;
export type StartCheckoutInput = z.infer<typeof StartCheckoutSchema>;

/* ── Inferred request types ─────────────────────────────────────────────── */

export type SchoolLoginInput = z.infer<typeof SchoolLoginSchema>;
export type RegisterSchoolInput = z.infer<typeof RegisterSchoolSchema>;
export type RequestOtpInput = z.infer<typeof RequestOtpSchema>;
export type WaitlistInput = z.infer<typeof WaitlistSchema>;
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;
export type CreateDiplomaInput = z.infer<typeof CreateDiplomaSchema>;
export type ListDiplomasQuery = z.infer<typeof ListDiplomasQuerySchema>;
export type RevokeDiplomaInput = z.infer<typeof RevokeDiplomaSchema>;
export type UpdateCdcSettingsInput = z.infer<typeof UpdateCdcSettingsSchema>;
export type CdcIdentityFormInput = z.infer<typeof CdcIdentityFormSchema>;
export type CreateCdcExportInput = z.infer<typeof CreateCdcExportSchema>;
export type CdcCrtUploadInput = z.infer<typeof CdcCrtUploadSchema>;
export type ListCdcExportsQuery = z.infer<typeof ListCdcExportsQuerySchema>;
export type SetCdcModuleEnabledInput = z.infer<typeof SetCdcModuleEnabledSchema>;
export type CreateShareLinkInput = z.infer<typeof CreateShareLinkSchema>;
export type VerifyProofInput = z.infer<typeof VerifyProofSchema>;
export type LogConsistencyQuery = z.infer<typeof LogConsistencyQuerySchema>;
export type ListJournalQuery = z.infer<typeof ListJournalQuerySchema>;
export type ReportJournalEntryInput = z.infer<typeof ReportJournalEntrySchema>;

/* ── MFA (TOTP) — shared by school & platform admin login ────────────────── */

export const TotpCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Code à 6 chiffres"),
});

/* ── Platform admin ─────────────────────────────────────────────────────── */

export const AdminLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

const reasonSchema = z.string().trim().min(3, "Motif requis (3 caractères min)").max(500);

export const RejectSchoolSchema = z.object({ reason: reasonSchema });
export const RevokeSchoolSchema = z.object({ reason: reasonSchema });

export const ReviewSchoolsQuerySchema = z.object({
  status: z.enum(["pending", "provisional", "approved", "rejected", "revoked"]).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const AdminDiplomasQuerySchema = z.object({
  status: z.enum(["active", "revoked"]).optional(),
  year: z.coerce.number().int().min(1990).max(2100).optional(),
  q: z.string().trim().max(120).optional(),
  schoolId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const ListAuditQuerySchema = z.object({
  type: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const UpdateSettingsSchema = z.object({
  autoValidateEnabled: z.boolean(),
  autoValidateMinScore: z.number().int().min(0).max(100),
});

export type TotpCodeInput = z.infer<typeof TotpCodeSchema>;
export type AdminLoginInput = z.infer<typeof AdminLoginSchema>;
export type RejectSchoolInput = z.infer<typeof RejectSchoolSchema>;
export type RevokeSchoolInput = z.infer<typeof RevokeSchoolSchema>;
export type ReviewSchoolsQuery = z.infer<typeof ReviewSchoolsQuerySchema>;
export type AdminDiplomasQuery = z.infer<typeof AdminDiplomasQuerySchema>;
export type ListAuditQuery = z.infer<typeof ListAuditQuerySchema>;
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;
