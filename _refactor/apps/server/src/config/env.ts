import { z } from "zod";

/**
 * Strict, fail-fast environment validation.
 * The process refuses to start with an invalid/incomplete configuration —
 * no insecure defaults for secrets.
 */

/** Parse common string booleans correctly ("false" must NOT be truthy). */
const zBool = (def: boolean) =>
  z
    .preprocess(
      (v) => (typeof v === "string" ? ["1", "true", "yes", "on"].includes(v.toLowerCase()) : v),
      z.boolean(),
    )
    .default(def);

/** An OAuth issuer is an origin, never an arbitrary URL with path or credentials. */
const zHttpOrigin = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === "http:" || url.protocol === "https:") &&
        url.username === "" &&
        url.password === "" &&
        url.pathname === "/" &&
        url.search === "" &&
        url.hash === ""
      );
    } catch {
      return false;
    }
  }, "PUBLIC_API_ORIGIN must be a bare HTTP(S) origin (for example https://api.example.com)");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Public web (:3000) + student wallet (:3001) + admin portal (:3002) by default in dev.
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:3001,http://localhost:3002"),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be ≥ 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be ≥ 32 chars"),
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(2_592_000),

  COOKIE_DOMAIN: z.string().default("localhost"),
  COOKIE_SECURE: zBool(false),

  // base64 of a 32-byte key — byte length is verified in crypto/envelope.ts
  MASTER_ENC_KEY: z.string().min(1, "MASTER_ENC_KEY is required"),
  OTP_PEPPER: z.string().min(16, "OTP_PEPPER must be ≥ 16 chars"),

  CERTIFYCHAIN_ROOT_PRIVATE_KEY: z.string().min(1, "Root private key is required"),
  CERTIFYCHAIN_ROOT_PUBLIC_KEY: z.string().min(1, "Root public key is required"),

  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  // Implicit TLS from the first byte (e.g. provider on :465). Off for plaintext
  // dev catchers like Mailpit (:1025).
  SMTP_SECURE: zBool(false),
  SMTP_FROM: z.string().default("CertifyChain <no-reply@certifychain.local>"),

  // ── INSEE Sirene API (authoritative SIRET registry — primary source) ───────
  // Empty INSEE_API_KEY → SIRENE check skipped (falls back to Gemini plausibility).
  INSEE_API_KEY: z.string().default(""),
  INSEE_API_BASE: z.string().default("https://api.insee.fr/api-sirene/3.11"),
  // Header carrying the application key on the current INSEE portal.
  INSEE_API_KEY_HEADER: z.string().default("X-INSEE-Api-Key-Integration"),

  // ── AI school validation (Google Gemini) ──────────────────────────────────
  // Empty GEMINI_API_KEY → validation degrades to "manual review" (score = null).
  GEMINI_API_KEY: z.string().default(""),
  GEMINI_MODEL: z.string().default("gemini-flash-latest"),
  // Auto-approve a freshly-registered school when the AI score ≥ the threshold.
  SCHOOL_AUTO_VALIDATE: zBool(false),
  SCHOOL_AUTO_VALIDATE_MIN_SCORE: z.coerce.number().int().min(0).max(100).default(85),
  // Where "new school to review" alerts are sent (test inbox by default).
  ADMIN_NOTIFY_EMAIL: z.string().default("admin-review@certifychain.local"),

  // Browser origins for email links / OAuth redirects (web public + wallet + admin).
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  // Student wallet portal — its own app/origin (holder notification links).
  WALLET_ORIGIN: z.string().default("http://localhost:3001"),
  ADMIN_ORIGIN: z.string().default("http://localhost:3002"),

  // ── ProConnect (DINUM OIDC) — strong ownership proof (verify.md §1) ────────
  // Empty PROCONNECT_CLIENT_ID → the ProConnect option is not offered.
  PROCONNECT_ISSUER: z.string().default("https://fca.integ01.dev-agentconnect.fr/api/v2"),
  PROCONNECT_CLIENT_ID: z.string().default(""),
  PROCONNECT_CLIENT_SECRET: z.string().default(""),
  PROCONNECT_REDIRECT_URI: z
    .string()
    .default("http://localhost:4000/verification/proconnect/callback"),
  PROCONNECT_SCOPES: z.string().default("openid siret given_name usual_name email"),

  // ── Stripe — paid postal proof dispatch (verify.md §2) ────────────────────
  // Empty STRIPE_SECRET_KEY → the postal option is not offered.
  STRIPE_SECRET_KEY: z.string().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().default(""),
  STRIPE_API_BASE: z.string().default("https://api.stripe.com"),
  /** Postal dispatch fee in the smallest currency unit (cents). */
  POSTAL_VERIFICATION_PRICE_CENTS: z.coerce.number().int().positive().default(500),
  POSTAL_VERIFICATION_CURRENCY: z.string().default("eur"),
  /** Max delivery delay communicated to the school (no precise ETA, verify.md). */
  POSTAL_MAX_DELIVERY_DAYS: z.coerce.number().int().positive().default(15),
  /** Ops mailbox that receives the postal dispatch order (dev: Mailpit/console). */
  POSTAL_DISPATCH_EMAIL: z.string().default("postal-dispatch@certifychain.local"),

  // ── Stripe — subscription billing (cahier des charges §5.1) ────────────────
  // Stripe Price object ids (NOT secrets — safe to version/override per env),
  // one per self-serve plan. Empty → that plan isn't offered (degrades cleanly,
  // same pattern as SIRENE/Gemini/ProConnect). Enterprise has no price: contact-sales.
  STRIPE_PRICE_STARTER: z.string().default(""),
  STRIPE_PRICE_PRO: z.string().default(""),

  // ── Platform admin bootstrap (prod: seed-admin script reads these) ─────────
  ADMIN_BOOTSTRAP_EMAIL: z.string().default(""),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().default(""),

  RATE_LIMIT_WINDOW: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  // Sensitive CDC identity data is erased this many days after acceptance.
  CDC_RETENTION_DAYS: z.coerce.number().int().positive().max(365).default(30),

  // ── EUDI Wallet / OpenID4VCI issuer ──────────────────────────────────────
  // Public, externally reachable API origin canonicalized as credential issuer.
  PUBLIC_API_ORIGIN: zHttpOrigin.default("http://localhost:4000"),
  VC_EXPORT_ENABLED: zBool(false),

  // Trust forwarding headers (X-Forwarded-For / X-Real-IP) ONLY when the API runs
  // behind a trusted reverse proxy (Railway/Fly/Vercel/nginx). Off by default so a
  // client cannot spoof its IP to bypass per-IP rate limits (see security audit #1).
  TRUST_PROXY: zBool(false),
  // Dedicated salt for audit IP pseudonymization (RGPD). Falls back to OTP_PEPPER
  // if unset — set a distinct value before processing real PII. An empty value
  // (e.g. a placeholder `AUDIT_IP_SALT=` line) is treated as unset, not invalid.
  AUDIT_IP_SALT: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().min(16).optional(),
  ),

  // ── V2 — Signer seam (v2.md §V2-1) ─────────────────────────────────────────
  // Where school issuer private keys live. 'envelope' (default) = AES-256-GCM
  // blob at rest, exactly as before. 'kms' = HashiCorp Vault Transit (Ed25519) —
  // keys never leave the vault. The two coexist per-school (schools.signer_kind),
  // so a switch to kms only affects schools approved afterwards (no migration).
  SIGNER_KIND: z.enum(["envelope", "kms"]).default("envelope"),
  VAULT_ADDR: z.string().default(""),
  VAULT_TOKEN: z.string().default(""),
  VAULT_TRANSIT_MOUNT: z.string().default("transit"),
  VAULT_KEY_PREFIX: z.string().default("certifychain-school"),

  // ── V3 — Transparency log anchoring (v2.md §V3-5) ──────────────────────────
  // Comma-separated OpenTimestamps calendar base URLs. Empty → anchoring is
  // disabled (clean degradation, same pattern as SIRENE/Gemini): checkpoints are
  // still signed and served, just never carry a Bitcoin timestamp proof.
  OTS_CALENDARS: z.string().default(""),

  MIGRATE_ON_START: zBool(true),
}).superRefine((value, ctx) => {
  if (
    value.NODE_ENV === "production" &&
    value.VC_EXPORT_ENABLED &&
    new URL(value.PUBLIC_API_ORIGIN).protocol !== "https:"
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["PUBLIC_API_ORIGIN"],
      message: "PUBLIC_API_ORIGIN must use HTTPS when EUDI export is enabled in production",
    });
  }
  // Selecting the KMS signer without a reachable, authenticated Vault would fail
  // at the FIRST school approval — fail fast at boot instead.
  if (value.SIGNER_KIND === "kms") {
    let validAddr = false;
    try {
      const url = new URL(value.VAULT_ADDR);
      validAddr = url.protocol === "http:" || url.protocol === "https:";
    } catch {
      validAddr = false;
    }
    if (!validAddr) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["VAULT_ADDR"],
        message:
          "VAULT_ADDR must be a valid http(s) URL when SIGNER_KIND=kms (for example https://vault.example.com)",
      });
    }
    if (value.VAULT_TOKEN.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["VAULT_TOKEN"],
        message: "VAULT_TOKEN is required when SIGNER_KIND=kms",
      });
    }
  }
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  // eslint-disable-next-line no-console
  console.error(`\n✖ Invalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

const raw = parsed.data;

// OpenTimestamps calendars (v2.md §V3-5): parsed once so `otsEnabled` mirrors the
// SIRENE/Gemini "configured" flags rather than being recomputed at each read.
const otsCalendars = raw.OTS_CALENDARS.split(",").map((u) => u.trim()).filter(Boolean);

export const env = Object.freeze({
  ...raw,
  isProd: raw.NODE_ENV === "production",
  isDev: raw.NODE_ENV === "development",
  // Secure cookies are forced on in production regardless of the flag.
  cookieSecure: raw.COOKIE_SECURE || raw.NODE_ENV === "production",
  corsOrigins: raw.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
  // True when AI school validation is wired up (otherwise → manual review).
  geminiConfigured: raw.GEMINI_API_KEY.length > 0,
  // True when the authoritative SIRENE registry check is wired up.
  inseeConfigured: raw.INSEE_API_KEY.length > 0,
  // True when the ProConnect ownership-proof option can be offered.
  proconnectConfigured: raw.PROCONNECT_CLIENT_ID.length > 0 && raw.PROCONNECT_CLIENT_SECRET.length > 0,
  // True when the paid postal ownership-proof option can be offered.
  stripeConfigured: raw.STRIPE_SECRET_KEY.length > 0,
  // Which self-serve subscription plans have a configured Stripe Price.
  billingPlansConfigured: {
    starter: raw.STRIPE_SECRET_KEY.length > 0 && raw.STRIPE_PRICE_STARTER.length > 0,
    pro: raw.STRIPE_SECRET_KEY.length > 0 && raw.STRIPE_PRICE_PRO.length > 0,
  },
  vcExportEnabled: raw.VC_EXPORT_ENABLED,
  // Parsed OpenTimestamps calendar list + a boolean gate (v2.md §V3-5).
  otsCalendars,
  otsEnabled: otsCalendars.length > 0,
});

export type Env = typeof env;
