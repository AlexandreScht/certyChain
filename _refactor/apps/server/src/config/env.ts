import { readFileSync } from "node:fs";
import { z } from "zod";
import { ML_DSA_PUBLIC_KEY_BYTES, ML_DSA_SECRET_KEY_BYTES } from "@certifychain/shared/crypto/ml-dsa";

/**
 * Strict, fail-fast environment validation.
 * The process refuses to start with an invalid/incomplete configuration —
 * no insecure defaults for secrets.
 */

/**
 * Docker secrets convention (P2, docs/architecture.md §12.2 — "secrets racine
 * en Docker secrets") : `<VAR>_FILE` (a filesystem path) takes precedence over
 * `<VAR>` itself when set. Docker secrets are mounted as tmpfs FILES (invisible
 * via `docker inspect` / `/proc/<pid>/environ`, unlike a plain `environment:`
 * value) — this is what lets them feed the exact same config surface without
 * any entrypoint shell script. The app container is DISTROLESS (no `sh` at
 * all, see Dockerfile), so this resolution MUST happen in Node itself, here,
 * before Zod ever sees `process.env` — not in a wrapper script.
 *
 * Scoped to the three secrets that actually warrant the ceremony documented in
 * `docs/security/root-secrets-rotation.md`: the two PKI root private keys
 * (Ed25519 + ML-DSA) and the master AES-256-GCM key. Everything else stays a
 * plain env var (SMTP/Stripe/etc. secrets are not root-of-trust material).
 */
const DOCKER_SECRET_FILE_VARS = [
  "CERTIFYCHAIN_ROOT_PRIVATE_KEY",
  "CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY",
  "MASTER_ENC_KEY",
] as const;

/**
 * Resolves `<VAR>_FILE` → `<VAR>` before validation. A file path that fails to
 * read (missing file, permission denied…) is a MISCONFIGURATION, not a silent
 * fallback to `<VAR>` — it fails fast here with the exact path and underlying
 * error, exactly like every other invalid-config case in this file.
 */
function resolveDockerSecretFiles(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const resolved: NodeJS.ProcessEnv = { ...source };
  for (const key of DOCKER_SECRET_FILE_VARS) {
    const filePath = source[`${key}_FILE`];
    if (filePath === undefined || filePath.trim() === "") continue;
    try {
      // Docker secrets files commonly carry a trailing newline (e.g. `printf`
      // vs `echo`, or an editor-added EOF newline) — trim it, base64/PEM
      // payloads never rely on trailing whitespace being meaningful.
      resolved[key] = readFileSync(filePath, "utf8").trim();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(
        `\n✖ Invalid environment configuration:\n` +
          `  • ${key}_FILE: cannot read secret file "${filePath}" ` +
          `(${e instanceof Error ? e.message : String(e)})\n`,
      );
      process.exit(1);
    }
  }
  return resolved;
}

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

  // The private key stays a SINGLE value: exactly one key ever signs (rotation
  // doc §4 — "on ne signe qu'avec la racine courante").
  CERTIFYCHAIN_ROOT_PRIVATE_KEY: z.string().min(1, "Root private key is required"),
  // ⚠️ Root rotation CSV (audit 2026-07-28, docs/security/root-secrets-
  // rotation.md §4): comma-separated list of base64-encoded Ed25519 SPKI PEM
  // public keys, EXACT same encoding/convention as the browser's
  // `NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PUBLIC_KEY` (`apps/client/web/src/lib/
  // trusted-roots.ts`) — an operator can copy the same value to both sides
  // without re-deriving anything. A single value with no comma (every
  // existing `.env`) parses to a one-element list and behaves EXACTLY as
  // before (see `certifychainRootPublicKeys` below). By convention the FIRST
  // entry is the one `CERTIFYCHAIN_ROOT_PRIVATE_KEY` signs with; any further
  // entries exist only so certificates signed under a now-rotated-out root
  // keep verifying (never removed while such a certificate still exists).
  CERTIFYCHAIN_ROOT_PUBLIC_KEY: z.string().min(1, "Root public key is required"),

  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  // Implicit TLS from the first byte (e.g. provider on :465). Off for plaintext
  // dev catchers like Mailpit (:1025). UNCHANGED by the addition of
  // SMTP_STARTTLS below — every existing `.env` (true or false) behaves
  // exactly as before.
  SMTP_SECURE: zBool(false),
  // ⚠️ STARTTLS (audit 2026-07-28, `smtp.ts`): explicit TLS elevation on an
  // initially PLAINTEXT connection — the mode almost every provider exposes
  // on port 587 (Resend/Mailgun/SendGrid/Postmark all do, alongside their
  // :465 implicit-TLS option), and the ONLY mode some test/dev SMTP relays
  // (e.g. Ethereal) expose at all. Orthogonal to SMTP_SECURE, not a
  // replacement for it — the two are mutually exclusive (checked below):
  //   • SMTP_SECURE=false, SMTP_STARTTLS=false (default) → plaintext, no TLS
  //     at all (Mailpit :1025 in dev). Historical default, unchanged.
  //   • SMTP_SECURE=true,  SMTP_STARTTLS=false            → TLS implicite dès
  //     le premier octet (port 465). Historical `true` behaviour, unchanged.
  //   • SMTP_SECURE=false, SMTP_STARTTLS=true              → NOUVEAU : connexion
  //     en clair puis élévation STARTTLS (port 587). `smtp.ts` échoue plutôt
  //     que de retomber sur un AUTH LOGIN en clair si le serveur ne l'annonce
  //     pas dans ses capacités EHLO.
  // Explicit opt-in (not auto-detected from SMTP_PORT): a port number is a
  // weak, provider-dependent signal (587 is *conventionally* STARTTLS but
  // nothing enforces it, some relays put STARTTLS on 25 or 2525) — an
  // explicit flag fails LOUDLY at boot on a typo instead of silently probing
  // or guessing the wrong transport for a security-sensitive choice.
  SMTP_STARTTLS: zBool(false),
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
  // Dedicated salt for audit IP pseudonymization (RGPD, P5/PLAN.md) — REQUIRED,
  // no silent fallback to OTP_PEPPER (a pepper protects OTP codes; reusing it
  // here would let anyone who ever recovers OTP_PEPPER also de-anonymize every
  // historical audit IP). Same minimum length as the other secrets in this
  // file. ⚠️ Rotating this value is fine (it's a pseudonym, not a key — no
  // ciphertext depends on it) but BREAKS correlation of IP hashes recorded
  // before the rotation against ones recorded after: document any rotation.
  AUDIT_IP_SALT: z.string().min(16, "AUDIT_IP_SALT must be ≥ 16 chars — set a value distinct from OTP_PEPPER"),

  // ── Logging (🟢, docs/architecture.md §12.2 "Logging applicatif") ──────────
  // Threshold for `lib/logger.ts` (debug < info < warn < error). Left OPTIONAL
  // here (no `.default(...)`) because the actual default depends on NODE_ENV
  // (verbose "debug" in dev, quieter "info" in prod) — computed below as
  // `logLevel`, the same pattern as `cookieSecure`. Set explicitly to turn on
  // "debug" in a production incident without a redeploy of code, or "warn" to
  // cut noise in a chatty dev session.
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),

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

  // ── V4 — Post-quantum hybrid (v2.md §V4-1) ─────────────────────────────────
  // 'off' = legacy behaviour, no ML-DSA-65 anywhere. 'dual-sign' = NEW
  // diplomas/certificates/checkpoints are ALSO signed in ML-DSA-65 (proof_
  // version 'v3'); v1/v2 diplomas already issued are untouched and keep
  // verifying exactly as before. 'require' (DEFAULT since 2026-07-28 — product
  // decision: the public front already advertises the « Post-quantique ·
  // ML-DSA » badge, FeaturesGrid.tsx:402, so the server must not be allowed to
  // ship a diploma that doesn't back that promise) = same emission behaviour
  // as dual-sign, except a PQ signing/minting failure ABORTS the emission
  // instead of ever falling back to v2 (see diplomas.service.ts for where
  // this is applied). Verification itself NEVER reads this flag
  // (packages/shared is policy-blind by design — see verify-bundle.ts): it
  // deduces the hybrid requirement from `payload.v === "sd-v3"` alone, so
  // flipping this flag can never make an already-issued diploma stop
  // verifying. Setting this back to 'off' is a conscious opt-out (dev/test
  // only) — it is NOT recommended in production since it breaks the front's
  // PQ badge promise.
  PQ_POLICY: z.enum(["off", "dual-sign", "require"]).default("require"),
  // base64 raw ML-DSA-65 key pair of the CertifyChain PKI root (no PEM/SPKI
  // convention exists for ML-DSA like for Ed25519). Required (and length-
  // checked below) only when PQ_POLICY !== "off" — which is the case by
  // DEFAULT now, so a fresh checkout with no PQ keys refuses to boot until
  // you generate them: `pnpm --filter @certifychain/server keys:root:pq`.
  // Same "single signer" rule as the classical private key above.
  CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY: z.string().default(""),
  // Same CSV rotation convention as `CERTIFYCHAIN_ROOT_PUBLIC_KEY` above —
  // comma-separated base64 raw ML-DSA-65 public keys, mirrored by the
  // browser's `NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY`. First entry signs.
  CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY: z.string().default(""),

  MIGRATE_ON_START: zBool(true),
}).superRefine((value, ctx) => {
  // Root rotation CSV (docs/security/root-secrets-rotation.md §4): a value made
  // ONLY of commas/whitespace (e.g. "," or " , ") satisfies `.min(1)` on the raw
  // string yet splits to zero real entries — fail fast here rather than let
  // `SERVER_TRUSTED_ROOTS` end up an empty "trust nothing" list at runtime.
  if (
    value.CERTIFYCHAIN_ROOT_PUBLIC_KEY.split(",")
      .map((s) => s.trim())
      .filter(Boolean).length === 0
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["CERTIFYCHAIN_ROOT_PUBLIC_KEY"],
      message:
        "CERTIFYCHAIN_ROOT_PUBLIC_KEY must contain at least one base64-encoded " +
        "Ed25519 public key (comma-separate several during a root rotation window)",
    });
  }
  // SMTP_SECURE (implicit TLS) and SMTP_STARTTLS (explicit elevation) are two
  // different transports for the SAME first TCP byte — combining them is
  // always a misconfiguration (most likely: copy-pasted both a :465 AND a
  // :587 example into the same `.env`), never a valid "extra secure" mode.
  // Fail fast at boot rather than let `smtp.ts` throw on the first send.
  if (value.SMTP_SECURE && value.SMTP_STARTTLS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SMTP_STARTTLS"],
      message:
        "SMTP_SECURE=true (TLS implicite, ex. port 465) et SMTP_STARTTLS=true " +
        "(élévation TLS explicite, ex. port 587) sont mutuellement exclusifs — " +
        "choisissez le mode correspondant au port configuré (SMTP_PORT).",
    });
  }
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
  // Enabling PQ_POLICY without a valid ML-DSA-65 root key pair would fail at
  // the FIRST emission (or checkpoint) — fail fast at boot instead, exactly
  // like the SIGNER_KIND=kms guard above. PQ_POLICY defaults to "require"
  // (since 2026-07-28), so this is the guard a fresh checkout with no PQ
  // keys hits FIRST — the message spells out WHY the boot refuses, and the
  // exact command to fix it, rather than a bare "wrong length" error.
  if (value.PQ_POLICY !== "off") {
    const reason =
      value.PQ_POLICY === "require"
        ? `PQ_POLICY defaults to "require" — no diploma may ship without a ` +
          `ML-DSA-65 root signature (the public front already advertises the ` +
          `« Post-quantique » badge)`
        : `PQ_POLICY="dual-sign" also needs a real ML-DSA-65 root key pair ` +
          `(diplomas are dual-signed as soon as it is set)`;
    const howTo =
      `Generate one with: pnpm --filter @certifychain/server keys:root:pq ` +
      `— then set CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY / _PRIVATE_KEY in .env. ` +
      `(To opt out instead, set PQ_POLICY=off explicitly — not recommended, ` +
      `see .env.example.)`;
    let privBytes: Buffer | null = null;
    try {
      privBytes = Buffer.from(value.CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY, "base64");
    } catch {
      privBytes = null;
    }
    if (!privBytes || privBytes.length !== ML_DSA_SECRET_KEY_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY"],
        message:
          `CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY must be a base64 ML-DSA-65 secret key ` +
          `(${ML_DSA_SECRET_KEY_BYTES} bytes, got ${privBytes ? privBytes.length : "unparseable"}). ` +
          `${reason}. ${howTo}`,
      });
    }
    // Root rotation CSV (docs/security/root-secrets-rotation.md §4): a plain
    // value with no comma is a one-element list and validates EXACTLY as
    // before (non-regression). Each entry is checked independently so ONE
    // malformed rotation entry reports its own precise error rather than
    // corrupting the byte-length check for the whole CSV blob.
    const pqPublicKeyEntries = value.CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (pqPublicKeyEntries.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY"],
        message:
          `CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY must contain at least one base64 ` +
          `ML-DSA-65 public key (${ML_DSA_PUBLIC_KEY_BYTES} bytes each; comma-separate ` +
          `several during a root rotation window). ${reason}. ${howTo}`,
      });
    }
    pqPublicKeyEntries.forEach((entry, index) => {
      let pubBytes: Buffer | null = null;
      try {
        pubBytes = Buffer.from(entry, "base64");
      } catch {
        pubBytes = null;
      }
      if (!pubBytes || pubBytes.length !== ML_DSA_PUBLIC_KEY_BYTES) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY"],
          message:
            `CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY entry ${index + 1}${pqPublicKeyEntries.length > 1 ? ` of ${pqPublicKeyEntries.length}` : ""} ` +
            `must be a base64 ML-DSA-65 public key ` +
            `(${ML_DSA_PUBLIC_KEY_BYTES} bytes, got ${pubBytes ? pubBytes.length : "unparseable"}). ` +
            `${reason}. ${howTo}`,
        });
      }
    });
  }
});

const parsed = EnvSchema.safeParse(resolveDockerSecretFiles(process.env));

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

// ── Root rotation CSV (audit 2026-07-28, docs/security/root-secrets-rotation.md
// §4) — parsed ONCE here, same pattern as `otsCalendars`/`corsOrigins` above, so
// every reader (`crypto/keys.ts`, `modules/verify/verify.routes.ts`) shares the
// exact same list rather than re-splitting the raw string. A single value with
// no comma (every `.env` predating this feature) yields a one-element array —
// identical runtime behaviour to before this CSV support existed. Non-emptiness
// is already guaranteed by the `superRefine` checks above (fail-fast at boot).
const certifychainRootPublicKeys = raw.CERTIFYCHAIN_ROOT_PUBLIC_KEY.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const certifychainRootPqPublicKeys = raw.CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const env = Object.freeze({
  ...raw,
  isProd: raw.NODE_ENV === "production",
  isDev: raw.NODE_ENV === "development",
  // `LOG_LEVEL` explicit override, else the historical NODE_ENV-based default
  // (verbose in dev, quieter in prod) — `lib/logger.ts` reads ONLY this,
  // never `process.env.NODE_ENV` directly (config/env.ts is the single
  // source of truth for config, per CLAUDE.md §7).
  logLevel: raw.LOG_LEVEL ?? (raw.NODE_ENV === "production" ? "info" : "debug"),
  // Secure cookies are forced on in production regardless of the flag.
  cookieSecure: raw.COOKIE_SECURE || raw.NODE_ENV === "production",
  corsOrigins: raw.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
  // Root rotation CSV, decoded once (see the two `const`s just above this
  // object) — `crypto/keys.ts` decodes each Ed25519 entry to PEM and, by
  // convention, treats index 0 as the one `CERTIFYCHAIN_ROOT_PRIVATE_KEY`
  // signs with. The ML-DSA-65 list stays base64 (no PEM/SPKI convention for
  // ML-DSA — same encoding `certifychainRootPqPublicKeyB64()` always used).
  certifychainRootPublicKeys,
  certifychainRootPqPublicKeys,
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
  // True once PQ_POLICY is "dual-sign" or "require" (v2.md §V4-1) — gates PQ
  // key provisioning/signing at emission and checkpoint time. Never read by
  // verification code (packages/shared is policy-blind by design).
  pqEnabled: raw.PQ_POLICY !== "off",
});

export type Env = typeof env;
