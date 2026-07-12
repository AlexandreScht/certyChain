import { zValidator } from "../../lib/validator";
import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { ADMIN_COOKIE, CLAIM, COOKIE, MFA, OTP, RATE_LIMIT } from "../../config/constants";
import { env } from "../../config/env";
import type { AdminSessionDTO, ClaimInfoDTO, MfaChallengeDTO, SessionDTO } from "@certifychain/contract/dto";
import {
  AdminLoginSchema,
  RequestOtpSchema,
  SchoolLoginSchema,
  TotpCodeSchema,
  VerifyOtpSchema,
} from "@certifychain/contract/schemas";
import { keyVault } from "../../crypto";
import { db } from "../../db/client";
import {
  diplomas,
  otpCodes,
  platformAdmins,
  refreshSessions,
  schoolAdmins,
  schools,
  students,
  studentEmailAliases,
} from "../../db/schema";
import type { AppEnv } from "../../http/types";
import {
  clearAuthCookies,
  clearMfaCookie,
  setAuthCookies,
  setMfaCookie,
} from "../../lib/cookies";
import { fail } from "../../lib/http-error";
import { urlToken } from "../../lib/ids";
import {
  loginLockMs,
  recordLoginFailure,
  recordLoginSuccess,
} from "../../lib/login-throttle";
import { sendDiplomaClaimEmail, sendOtpEmail } from "../../lib/mailer";
import { maskEmail } from "../../lib/mask";
import { shortUserAgent } from "../../lib/net";
import { generateOtp, hashOtp, verifyOtp } from "../../lib/otp";
import { verifyPassword } from "../../lib/password";
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  signMfaToken,
  verifyMfaToken,
} from "../../lib/tokens";
import { generateTotpSecret, totpAuthUri, verifyTotp } from "../../lib/totp";
import { getAuth, requireAdminAuth, requireAuth } from "../../middleware/auth";
import { csrfProtect } from "../../middleware/csrf";
import { enforceRateLimit } from "../../middleware/rate-limit";
import { recordAudit } from "../audit/audit.service";
import { getDummyPasswordHash } from "./auth.service";
import { claimAlias } from "./claim.service";

/* ── Helpers ────────────────────────────────────────────────────────────── */

/** Persist a fresh refresh session and return the opaque token to set as a cookie. */
async function createRefreshSession(
  subjectType: "school_admin" | "student" | "admin",
  subjectId: string,
  userAgent: string,
): Promise<string> {
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL * 1000);
  await db.insert(refreshSessions).values({
    subjectType,
    subjectId,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt,
    userAgent: userAgent || null,
  });
  return refreshToken;
}

type MfaPlan =
  | { stage: "enroll"; secretB32: string; encrypted: string }
  | { stage: "verify"; secretB32: string };

/**
 * Decides the next MFA step from an account's stored enrollment state.
 * Enrolled → verify against the stored secret. Not yet enrolled → mint a fresh
 * secret to enroll (the caller persists `encrypted` and shows the QR/secret).
 */
function mfaPlan(totpSecret: string | null, totpEnabledAt: Date | null): MfaPlan {
  if (totpEnabledAt && totpSecret) {
    return { stage: "verify", secretB32: keyVault.decryptToString(totpSecret) };
  }
  const secretB32 = generateTotpSecret();
  return { stage: "enroll", secretB32, encrypted: keyVault.encrypt(secretB32) };
}

function challengeFromPlan(plan: MfaPlan, accountEmail: string): MfaChallengeDTO {
  return plan.stage === "enroll"
    ? {
        mfaStage: "enroll",
        otpauthUri: totpAuthUri(accountEmail, plan.secretB32),
        secret: plan.secretB32,
      }
    : { mfaStage: "verify" };
}

/** Loads the alias row this claim token currently resolves to, if any. */
async function loadClaimableAlias(token: string) {
  const [alias] = await db
    .select()
    .from(studentEmailAliases)
    .where(eq(studentEmailAliases.claimToken, token))
    .limit(1);
  return alias ?? null;
}

export const authRoutes = new Hono<AppEnv>()

  /* ── 1) School admin login — step 1: password → MFA challenge ──────────── */

  .post(
  "/school/login",
  zValidator("json", SchoolLoginSchema),
  async (c) => {
    const { email, password } = c.req.valid("json");

    // Per-account (not per-IP): a shared campus IP must not throttle distinct
    // admins; complements the progressive per-account lockout below.
    enforceRateLimit(c, { key: "login", identifier: email, ...RATE_LIMIT.LOGIN_EMAIL });

    const lockMs = loginLockMs(email);
    if (lockMs > 0) {
      throw fail.rateLimited(
        `Compte temporairement verrouillé. Réessayez dans ${Math.ceil(lockMs / 60_000)} min.`,
      );
    }

    const [row] = await db
      .select({ admin: schoolAdmins, school: schools })
      .from(schoolAdmins)
      .innerJoin(schools, eq(schoolAdmins.schoolId, schools.id))
      .where(sql`lower(${schoolAdmins.email}) = ${email}`)
      .limit(1);

    // Constant-time path (dummy hash when missing) — anti user-enumeration.
    const storedHash = row ? row.admin.passwordHash : await getDummyPasswordHash();
    const passwordOk = await verifyPassword(password, storedHash);

    if (!row || !passwordOk) {
      recordLoginFailure(email);
      throw fail.invalidCredentials();
    }
    recordLoginSuccess(email);
    if (row.school.status === "rejected" || row.school.status === "revoked") {
      throw fail.schoolNotApproved();
    }

    // Issue a TOTP challenge — no session is minted until the second step.
    const plan = mfaPlan(row.admin.totpSecret, row.admin.totpEnabledAt);
    if (plan.stage === "enroll") {
      await db
        .update(schoolAdmins)
        .set({ totpSecret: plan.encrypted })
        .where(eq(schoolAdmins.id, row.admin.id));
    }
    const mfaToken = await signMfaToken(
      {
        sub: row.admin.id,
        role: "school_admin",
        realm: "public",
        purpose: plan.stage === "enroll" ? "mfa_enroll" : "mfa_verify",
      },
      MFA.CHALLENGE_TTL_SECONDS,
    );
    setMfaCookie(c, mfaToken, "public");

    return c.json(challengeFromPlan(plan, row.admin.email));
  },
  )

/* ── 1b) School admin login — step 2: TOTP → session ────────────────────── */

  .post(
  "/school/login/totp",
  zValidator("json", TotpCodeSchema),
  async (c) => {
    const { code } = c.req.valid("json");

    const token = getCookie(c, COOKIE.MFA);
    if (!token) throw fail.mfaRequired("Défi MFA expiré, reconnectez-vous");

    let claims;
    try {
      claims = await verifyMfaToken(token);
    } catch {
      clearMfaCookie(c, "public");
      throw fail.mfaRequired("Défi MFA invalide");
    }
    if (claims.realm !== "public" || claims.role !== "school_admin") throw fail.forbidden();

    // Bound TOTP guessing per account (not per IP) — the MFA-pending subject.
    enforceRateLimit(c, { key: "totp", identifier: claims.sub, ...RATE_LIMIT.TOTP_VERIFY_ACCOUNT });

    const [row] = await db
      .select({ admin: schoolAdmins, school: schools })
      .from(schoolAdmins)
      .innerJoin(schools, eq(schoolAdmins.schoolId, schools.id))
      .where(eq(schoolAdmins.id, claims.sub))
      .limit(1);

    if (!row || !row.admin.totpSecret) {
      clearMfaCookie(c, "public");
      throw fail.unauthorized();
    }

    if (!verifyTotp(code, keyVault.decryptToString(row.admin.totpSecret))) {
      throw fail.mfaInvalid();
    }

    if (claims.purpose === "mfa_enroll" && !row.admin.totpEnabledAt) {
      await db
        .update(schoolAdmins)
        .set({ totpEnabledAt: new Date() })
        .where(eq(schoolAdmins.id, row.admin.id));
    }

    const refreshToken = await createRefreshSession("school_admin", row.admin.id, shortUserAgent(c));
    const access = await signAccessToken({
      sub: row.admin.id,
      role: "school_admin",
      email: row.admin.email,
      schoolId: row.school.id,
    });
    setAuthCookies(c, { access, refresh: refreshToken, csrf: urlToken(18) }, "public");
    clearMfaCookie(c, "public");

    await db
      .update(schoolAdmins)
      .set({ lastLoginAt: new Date() })
      .where(eq(schoolAdmins.id, row.admin.id));
    await recordAudit({ type: "school_login", schoolId: row.school.id });

    const session: SessionDTO = {
      role: "school_admin",
      sub: row.admin.id,
      email: row.admin.email,
      schoolId: row.school.id,
      schoolStatus: row.school.status,
    };
    return c.json(session);
  },
  )

/* ── 2) Student OTP request ─────────────────────────────────────────────── */

  .post(
  "/student/otp/request",
  zValidator("json", RequestOtpSchema),
  async (c) => {
    const { email } = c.req.valid("json");

    // Per-email (not per-IP): 2 000 students behind one campus NAT each get their
    // own budget. Applied before the lookup so it leaks nothing about existence.
    enforceRateLimit(c, { key: "otp_req", identifier: email, ...RATE_LIMIT.OTP_REQUEST_EMAIL });

    const [student] = await db
      .select()
      .from(students)
      .where(sql`lower(${students.email}) = ${email}`)
      .limit(1);

    // Always respond ok to avoid revealing whether the email is registered.
    if (!student) return c.json({ ok: true });

    // Enforce a resend cooldown: skip issuing a new code if a recent one exists.
    const cooldownStart = new Date(Date.now() - OTP.RESEND_COOLDOWN * 1000);
    const [recent] = await db
      .select({ id: otpCodes.id })
      .from(otpCodes)
      .where(
        and(
          sql`lower(${otpCodes.email}) = ${email}`,
          eq(otpCodes.purpose, "student_login"),
          gt(otpCodes.createdAt, cooldownStart),
        ),
      )
      .limit(1);

    if (recent) return c.json({ ok: true });

    // Platform-wide send budget — caps email cost against address-spraying,
    // regardless of source IP. Only charged when an email is actually issued.
    enforceRateLimit(c, {
      key: "otp_send",
      identifier: "global",
      ...RATE_LIMIT.OTP_SEND_GLOBAL,
    });

    const code = generateOtp();
    await db.insert(otpCodes).values({
      email,
      purpose: "student_login",
      codeHash: hashOtp(code),
      expiresAt: new Date(Date.now() + OTP.TTL_SECONDS * 1000),
    });
    await sendOtpEmail(email, code);

    return c.json({ ok: true });
  },
  )

/* ── 3) Student OTP verify ──────────────────────────────────────────────── */

  .post(
  "/student/otp/verify",
  zValidator("json", VerifyOtpSchema),
  async (c) => {
    const { email, code } = c.req.valid("json");

    // Per-email backstop (the per-code MAX_ATTEMPTS=5 is the hard brute-force stop).
    enforceRateLimit(c, { key: "otp_vrf", identifier: email, ...RATE_LIMIT.OTP_VERIFY_EMAIL });

    const [otp] = await db
      .select()
      .from(otpCodes)
      .where(
        and(
          sql`lower(${otpCodes.email}) = ${email}`,
          eq(otpCodes.purpose, "student_login"),
          isNull(otpCodes.consumedAt),
          gt(otpCodes.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(otpCodes.createdAt))
      .limit(1);

    if (!otp) throw fail.otpExpired();

    if (otp.attempts >= OTP.MAX_ATTEMPTS) {
      await db
        .update(otpCodes)
        .set({ consumedAt: new Date() })
        .where(eq(otpCodes.id, otp.id));
      throw fail.otpLocked();
    }

    if (!verifyOtp(code, otp.codeHash)) {
      // SQL-side increment: two concurrent wrong guesses must count as two.
      await db
        .update(otpCodes)
        .set({ attempts: sql`${otpCodes.attempts} + 1` })
        .where(eq(otpCodes.id, otp.id));
      throw fail.otpInvalid();
    }

    await db
      .update(otpCodes)
      .set({ consumedAt: new Date() })
      .where(eq(otpCodes.id, otp.id));

    // Find or create the student.
    const [existing] = await db
      .select()
      .from(students)
      .where(sql`lower(${students.email}) = ${email}`)
      .limit(1);

    const student =
      existing ?? (await db.insert(students).values({ email }).returning())[0];

    // `existing` only matches rows with a non-null email (a provisional/unclaimed
    // student has none); the insert branch sets it explicitly — always non-null
    // here in practice. Guard rather than assert, so a broken invariant fails safe.
    if (!student || !student.email) throw fail.internal();
    const studentEmail = student.email;

    const refreshToken = await createRefreshSession("student", student.id, shortUserAgent(c));
    const access = await signAccessToken({
      sub: student.id,
      role: "student",
      email: studentEmail,
    });
    setAuthCookies(c, { access, refresh: refreshToken, csrf: urlToken(18) }, "public");

    await recordAudit({ type: "student_login" });

    const session: SessionDTO = {
      role: "student",
      sub: student.id,
      email: studentEmail,
    };
    return c.json(session);
  },
  )

/* ── 4) Refresh (rotate) — public realm (school_admin / student) ─────────── */

  .post("/refresh", csrfProtect(), async (c) => {
  const presented = getCookie(c, COOKIE.REFRESH);
  if (!presented) {
    clearAuthCookies(c);
    throw fail.unauthorized();
  }

  const tokenHash = hashRefreshToken(presented);
  const [session] = await db
    .select()
    .from(refreshSessions)
    .where(
      and(
        eq(refreshSessions.tokenHash, tokenHash),
        isNull(refreshSessions.revokedAt),
        gt(refreshSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!session || session.subjectType === "admin") {
    clearAuthCookies(c);
    throw fail.unauthorized();
  }

  let claims: { sub: string; role: "school_admin" | "student"; email: string; schoolId?: string };
  let schoolStatus: SessionDTO["schoolStatus"];

  if (session.subjectType === "school_admin") {
    const [row] = await db
      .select({ admin: schoolAdmins, school: schools })
      .from(schoolAdmins)
      .innerJoin(schools, eq(schoolAdmins.schoolId, schools.id))
      .where(eq(schoolAdmins.id, session.subjectId))
      .limit(1);
    if (!row) {
      clearAuthCookies(c);
      throw fail.unauthorized();
    }
    // Mirror the login status gate: a rejected/revoked school must not be able to
    // rotate its refresh token and keep a live session. (admin.revokeSchool also
    // kills existing sessions; this closes the window for a session in flight.)
    if (row.school.status === "rejected" || row.school.status === "revoked") {
      await db
        .update(refreshSessions)
        .set({ revokedAt: new Date() })
        .where(eq(refreshSessions.id, session.id));
      clearAuthCookies(c);
      throw fail.schoolNotApproved();
    }
    claims = {
      sub: row.admin.id,
      role: "school_admin",
      email: row.admin.email,
      schoolId: row.school.id,
    };
    schoolStatus = row.school.status;
  } else {
    const [student] = await db
      .select()
      .from(students)
      .where(eq(students.id, session.subjectId))
      .limit(1);
    // A provisional (unclaimed) student has no email and can never legitimately
    // hold a refresh session — claiming only ever mints cookies for the
    // resolved (post-claim) identity. Fail safe if that invariant is ever broken.
    if (!student || !student.email) {
      clearAuthCookies(c);
      throw fail.unauthorized();
    }
    claims = { sub: student.id, role: "student", email: student.email };
  }

  await db
    .update(refreshSessions)
    .set({ revokedAt: new Date() })
    .where(eq(refreshSessions.id, session.id));

  const refreshToken = await createRefreshSession(session.subjectType, session.subjectId, shortUserAgent(c));
  const access = await signAccessToken(claims);
  setAuthCookies(c, { access, refresh: refreshToken, csrf: urlToken(18) }, "public");

  const out: SessionDTO = {
    role: claims.role,
    sub: claims.sub,
    email: claims.email,
    ...(claims.schoolId ? { schoolId: claims.schoolId } : {}),
    ...(schoolStatus ? { schoolStatus } : {}),
  };
  return c.json(out);
  })

/* ── 5) Logout — public realm ───────────────────────────────────────────── */

  .post("/logout", csrfProtect(), async (c) => {
  const presented = getCookie(c, COOKIE.REFRESH);
  if (presented) {
    await db
      .update(refreshSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshSessions.tokenHash, hashRefreshToken(presented)),
          isNull(refreshSessions.revokedAt),
        ),
      );
  }
  clearAuthCookies(c);
  return c.json({ ok: true });
  })

/* ── 6) Current session — public realm ──────────────────────────────────── */

  .get("/me", requireAuth(), async (c) => {
  const auth = getAuth(c);

  const session: SessionDTO = {
    role: auth.role,
    sub: auth.sub,
    email: auth.email,
  };

  if (auth.role === "school_admin" && auth.schoolId) {
    session.schoolId = auth.schoolId;
    const [school] = await db
      .select({ status: schools.status })
      .from(schools)
      .where(eq(schools.id, auth.schoolId))
      .limit(1);
    if (school) session.schoolStatus = school.status;
  }

  return c.json(session);
  })

/* ── 7) Student claim — bind a school-issued address to a personal wallet ──
   Public/unauthenticated (the claim token itself is the bearer secret, mailed
   only to the school address at issuance — see diplomas.service.ts). Every
   route below is keyed by the token for rate-limiting (immune to IP rotation,
   same rationale as the auth-flow budgets above), not by IP. ────────────── */

/** GET /auth/student/claim/:token — public info for the claim landing page. */
  .get("/student/claim/:token", async (c) => {
  const token = c.req.param("token");
  enforceRateLimit(c, { key: "claim_tok", identifier: token, ...RATE_LIMIT.CLAIM_TOKEN });

  const alias = await loadClaimableAlias(token);
  if (!alias) {
    const out: ClaimInfoDTO = {
      status: "not_found",
      schoolName: null,
      diplomaCount: 0,
      maskedEmail: null,
    };
    return c.json(out);
  }

  const [school] = await db
    .select({ name: schools.name })
    .from(schools)
    .where(eq(schools.id, alias.schoolId))
    .limit(1);
  const [countRow] = await db
    .select({ value: count() })
    .from(diplomas)
    .where(eq(diplomas.studentId, alias.studentId));

  const status: ClaimInfoDTO["status"] = alias.verifiedAt
    ? "claimed"
    : !alias.claimTokenExpiresAt || alias.claimTokenExpiresAt < new Date()
      ? "expired"
      : "pending";

  const out: ClaimInfoDTO = {
    status,
    schoolName: school?.name ?? null,
    diplomaCount: countRow?.value ?? 0,
    maskedEmail: maskEmail(alias.email),
  };
  return c.json(out);
  })

/** POST /auth/student/claim/:token/otp/request — OTP to the personal email typed in. */
  .post(
  "/student/claim/:token/otp/request",
  zValidator("json", RequestOtpSchema),
  async (c) => {
    const token = c.req.param("token");
    enforceRateLimit(c, { key: "claim_tok", identifier: token, ...RATE_LIMIT.CLAIM_TOKEN });

    const alias = await loadClaimableAlias(token);
    if (!alias || alias.verifiedAt || !alias.claimTokenExpiresAt || alias.claimTokenExpiresAt < new Date()) {
      throw fail.notFound("Lien de récupération invalide ou expiré");
    }

    const { email } = c.req.valid("json");
    // Unlike login's OTP request, this always sends: typing a not-yet-known
    // personal email is the EXPECTED first-claim case, not an enumeration signal.
    enforceRateLimit(c, { key: "otp_req_claim", identifier: email, ...RATE_LIMIT.OTP_REQUEST_EMAIL });

    const cooldownStart = new Date(Date.now() - OTP.RESEND_COOLDOWN * 1000);
    const [recent] = await db
      .select({ id: otpCodes.id })
      .from(otpCodes)
      .where(
        and(
          sql`lower(${otpCodes.email}) = ${email}`,
          eq(otpCodes.purpose, "student_claim"),
          gt(otpCodes.createdAt, cooldownStart),
        ),
      )
      .limit(1);
    if (recent) return c.json({ ok: true });

    enforceRateLimit(c, { key: "otp_send", identifier: "global", ...RATE_LIMIT.OTP_SEND_GLOBAL });

    const code = generateOtp();
    await db.insert(otpCodes).values({
      email,
      purpose: "student_claim",
      codeHash: hashOtp(code),
      expiresAt: new Date(Date.now() + OTP.TTL_SECONDS * 1000),
    });
    await sendOtpEmail(email, code);

    return c.json({ ok: true });
  },
  )

/** POST /auth/student/claim/:token/otp/verify — proves the personal email, completes the claim. */
  .post(
  "/student/claim/:token/otp/verify",
  zValidator("json", VerifyOtpSchema),
  async (c) => {
    const token = c.req.param("token");
    enforceRateLimit(c, { key: "claim_tok", identifier: token, ...RATE_LIMIT.CLAIM_TOKEN });

    const alias = await loadClaimableAlias(token);
    if (!alias || alias.verifiedAt || !alias.claimTokenExpiresAt || alias.claimTokenExpiresAt < new Date()) {
      throw fail.notFound("Lien de récupération invalide ou expiré");
    }

    const { email, code } = c.req.valid("json");
    enforceRateLimit(c, { key: "otp_vrf_claim", identifier: email, ...RATE_LIMIT.OTP_VERIFY_EMAIL });

    const [otp] = await db
      .select()
      .from(otpCodes)
      .where(
        and(
          sql`lower(${otpCodes.email}) = ${email}`,
          eq(otpCodes.purpose, "student_claim"),
          isNull(otpCodes.consumedAt),
          gt(otpCodes.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(otpCodes.createdAt))
      .limit(1);

    if (!otp) throw fail.otpExpired();
    if (otp.attempts >= OTP.MAX_ATTEMPTS) {
      await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, otp.id));
      throw fail.otpLocked();
    }
    if (!verifyOtp(code, otp.codeHash)) {
      await db
        .update(otpCodes)
        .set({ attempts: sql`${otpCodes.attempts} + 1` })
        .where(eq(otpCodes.id, otp.id));
      throw fail.otpInvalid();
    }
    await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, otp.id));

    const student = await claimAlias(alias.id, email);
    if (!student.email) throw fail.internal();
    const studentEmail = student.email;

    const refreshToken = await createRefreshSession("student", student.id, shortUserAgent(c));
    const access = await signAccessToken({ sub: student.id, role: "student", email: studentEmail });
    setAuthCookies(c, { access, refresh: refreshToken, csrf: urlToken(18) }, "public");

    await recordAudit({ type: "student_claim", schoolId: alias.schoolId });

    const session: SessionDTO = { role: "student", sub: student.id, email: studentEmail };
    return c.json(session);
  },
  )

/** POST /auth/student/claim/:token/resend — mints a fresh token, re-sends the invite. */
  .post("/student/claim/:token/resend", async (c) => {
  const token = c.req.param("token");
  enforceRateLimit(c, { key: "claim_resend", identifier: token, ...RATE_LIMIT.CLAIM_RESEND });

  const alias = await loadClaimableAlias(token);
  if (!alias) throw fail.notFound("Lien de récupération invalide");
  if (alias.verifiedAt) throw fail.conflict("Ce diplôme a déjà été récupéré");

  const [school] = await db
    .select({ name: schools.name })
    .from(schools)
    .where(eq(schools.id, alias.schoolId))
    .limit(1);
  if (!school) throw fail.internal();

  const newToken = urlToken(CLAIM.TOKEN_BYTES);
  await db
    .update(studentEmailAliases)
    .set({ claimToken: newToken, claimTokenExpiresAt: new Date(Date.now() + CLAIM.TTL_SECONDS * 1000) })
    .where(eq(studentEmailAliases.id, alias.id));

  await sendDiplomaClaimEmail(alias.email, `${env.WALLET_ORIGIN}/claim/${newToken}`, school.name);

  return c.json({ ok: true });
  })

/* ════════════════════════════════════════════════════════════════════════
   Platform admin realm (isolated cookies: cc_admin_*)
   ════════════════════════════════════════════════════════════════════════ */

/* ── A) Admin login — step 1: password → MFA challenge ──────────────────── */

  .post(
  "/admin/login",
  zValidator("json", AdminLoginSchema),
  async (c) => {
    const { email, password } = c.req.valid("json");

    // Per-account (not per-IP); complements the progressive per-account lockout.
    enforceRateLimit(c, { key: "login", identifier: email, ...RATE_LIMIT.LOGIN_EMAIL });

    const lockMs = loginLockMs(email);
    if (lockMs > 0) {
      throw fail.rateLimited(
        `Compte temporairement verrouillé. Réessayez dans ${Math.ceil(lockMs / 60_000)} min.`,
      );
    }

    const [admin] = await db
      .select()
      .from(platformAdmins)
      .where(sql`lower(${platformAdmins.email}) = ${email}`)
      .limit(1);

    const storedHash = admin ? admin.passwordHash : await getDummyPasswordHash();
    const passwordOk = await verifyPassword(password, storedHash);

    if (!admin || !passwordOk) {
      recordLoginFailure(email);
      throw fail.invalidCredentials();
    }
    recordLoginSuccess(email);

    const plan = mfaPlan(admin.totpSecret, admin.totpEnabledAt);
    if (plan.stage === "enroll") {
      await db
        .update(platformAdmins)
        .set({ totpSecret: plan.encrypted })
        .where(eq(platformAdmins.id, admin.id));
    }
    const mfaToken = await signMfaToken(
      {
        sub: admin.id,
        role: "admin",
        realm: "admin",
        purpose: plan.stage === "enroll" ? "mfa_enroll" : "mfa_verify",
      },
      MFA.CHALLENGE_TTL_SECONDS,
    );
    setMfaCookie(c, mfaToken, "admin");

    return c.json(challengeFromPlan(plan, admin.email));
  },
  )

/* ── B) Admin login — step 2: TOTP → admin session ──────────────────────── */

  .post(
  "/admin/login/totp",
  zValidator("json", TotpCodeSchema),
  async (c) => {
    const { code } = c.req.valid("json");

    const token = getCookie(c, ADMIN_COOKIE.MFA);
    if (!token) throw fail.mfaRequired("Défi MFA expiré, reconnectez-vous");

    let claims;
    try {
      claims = await verifyMfaToken(token);
    } catch {
      clearMfaCookie(c, "admin");
      throw fail.mfaRequired("Défi MFA invalide");
    }
    if (claims.realm !== "admin" || claims.role !== "admin") throw fail.forbidden();

    // Bound TOTP guessing per account (not per IP) — the MFA-pending subject.
    enforceRateLimit(c, { key: "totp", identifier: claims.sub, ...RATE_LIMIT.TOTP_VERIFY_ACCOUNT });

    const [admin] = await db
      .select()
      .from(platformAdmins)
      .where(eq(platformAdmins.id, claims.sub))
      .limit(1);

    if (!admin || !admin.totpSecret) {
      clearMfaCookie(c, "admin");
      throw fail.unauthorized();
    }

    if (!verifyTotp(code, keyVault.decryptToString(admin.totpSecret))) {
      throw fail.mfaInvalid();
    }

    if (claims.purpose === "mfa_enroll" && !admin.totpEnabledAt) {
      await db
        .update(platformAdmins)
        .set({ totpEnabledAt: new Date() })
        .where(eq(platformAdmins.id, admin.id));
    }

    const refreshToken = await createRefreshSession("admin", admin.id, shortUserAgent(c));
    const access = await signAccessToken({ sub: admin.id, role: "admin", email: admin.email });
    setAuthCookies(c, { access, refresh: refreshToken, csrf: urlToken(18) }, "admin");
    clearMfaCookie(c, "admin");

    await db
      .update(platformAdmins)
      .set({ lastLoginAt: new Date() })
      .where(eq(platformAdmins.id, admin.id));
    await recordAudit({ type: "admin_login" });

    const session: AdminSessionDTO = {
      role: "admin",
      sub: admin.id,
      email: admin.email,
      fullName: admin.fullName,
    };
    return c.json(session);
  },
  )

/* ── C) Admin refresh (rotate) ──────────────────────────────────────────── */

  .post("/admin/refresh", csrfProtect({ cookie: ADMIN_COOKIE.CSRF }), async (c) => {
  const presented = getCookie(c, ADMIN_COOKIE.REFRESH);
  if (!presented) {
    clearAuthCookies(c, "admin");
    throw fail.unauthorized();
  }

  const [session] = await db
    .select()
    .from(refreshSessions)
    .where(
      and(
        eq(refreshSessions.tokenHash, hashRefreshToken(presented)),
        eq(refreshSessions.subjectType, "admin"),
        isNull(refreshSessions.revokedAt),
        gt(refreshSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!session) {
    clearAuthCookies(c, "admin");
    throw fail.unauthorized();
  }

  const [admin] = await db
    .select()
    .from(platformAdmins)
    .where(eq(platformAdmins.id, session.subjectId))
    .limit(1);
  if (!admin) {
    clearAuthCookies(c, "admin");
    throw fail.unauthorized();
  }

  await db
    .update(refreshSessions)
    .set({ revokedAt: new Date() })
    .where(eq(refreshSessions.id, session.id));

  const refreshToken = await createRefreshSession("admin", admin.id, shortUserAgent(c));
  const access = await signAccessToken({ sub: admin.id, role: "admin", email: admin.email });
  setAuthCookies(c, { access, refresh: refreshToken, csrf: urlToken(18) }, "admin");

  const out: AdminSessionDTO = {
    role: "admin",
    sub: admin.id,
    email: admin.email,
    fullName: admin.fullName,
  };
  return c.json(out);
  })

/* ── D) Admin logout ────────────────────────────────────────────────────── */

  .post("/admin/logout", csrfProtect({ cookie: ADMIN_COOKIE.CSRF }), async (c) => {
  const presented = getCookie(c, ADMIN_COOKIE.REFRESH);
  if (presented) {
    await db
      .update(refreshSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshSessions.tokenHash, hashRefreshToken(presented)),
          isNull(refreshSessions.revokedAt),
        ),
      );
  }
  clearAuthCookies(c, "admin");
  return c.json({ ok: true });
  })

/* ── E) Current admin session ───────────────────────────────────────────── */

  .get("/admin/me", requireAdminAuth(), async (c) => {
  const auth = getAuth(c);
  const [admin] = await db
    .select()
    .from(platformAdmins)
    .where(eq(platformAdmins.id, auth.sub))
    .limit(1);

  const session: AdminSessionDTO = {
    role: "admin",
    sub: auth.sub,
    email: auth.email,
    fullName: admin?.fullName ?? null,
  };
  return c.json(session);
  })
