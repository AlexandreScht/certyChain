import { zValidator } from "../../lib/validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { RATE_LIMIT } from "../../config/constants";
import { env } from "../../config/env";
import {
  ListJournalQuerySchema,
  RegisterSchoolSchema,
  ReportJournalEntrySchema,
  WaitlistSchema,
} from "@certifychain/contract/schemas";
import { db } from "../../db/client";
import { type School, schoolAdmins, schools } from "../../db/schema";
import type { AppEnv } from "../../http/types";
import { fail } from "../../lib/http-error";
import { logger } from "../../lib/logger";
import { sendSchoolReviewNotification, sendWaitlistNotification } from "../../lib/mailer";
import { anonymizeIp, clientIp, shortUserAgent } from "../../lib/net";
import { hashPassword } from "../../lib/password";
import { getAuth, requireAuth } from "../../middleware/auth";
import { csrfProtect } from "../../middleware/csrf";
import { rateLimit } from "../../middleware/rate-limit";
import { recordAudit } from "../audit/audit.service";
import { sendProvisionalInvite } from "../verification/verification.service";
import {
  approveSchool,
  getSchoolById,
  getSchoolStats,
  schoolAdminExists,
  schoolWithSiretExists,
  toSchoolDTO,
} from "./schools.service";
import { computeSchoolValidation, maybeAutoValidate } from "./validation.service";
import { getSchoolJournal, reportJournalEntry } from "../transparency/journal.service";

/** Postgres unique-constraint violation (e.g. two schools racing on one SIRET). */
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: unknown }).code === "23505"
  );
}

/** Name of the violated unique constraint/index, when the driver exposes it. */
function violatedConstraint(e: unknown): string {
  const err = e as { constraint_name?: unknown; constraint?: unknown } | null;
  const name = err?.constraint_name ?? err?.constraint;
  return typeof name === "string" ? name : "";
}

export const schoolsRoutes = new Hono<AppEnv>()

  /** POST /schools/register — self-service school registration (pending approval). */
  .post(
  "/register",
  rateLimit({ key: "register", ...RATE_LIMIT.REGISTER_IP }),
  zValidator("json", RegisterSchoolSchema),
  async (c) => {
    const body = c.req.valid("json");

    if (await schoolAdminExists(body.adminEmail)) {
      throw fail.conflict("Un compte existe déjà pour cet e-mail");
    }

    // A SIRET identifies exactly one establishment → reject a duplicate up front
    // with a friendly 409 (the DB unique index is the race-proof backstop below).
    if (await schoolWithSiretExists(body.siret)) {
      throw fail.conflict("Un établissement est déjà enregistré avec ce SIRET.");
    }

    // Hash outside the transaction (scrypt is slow — don't hold a tx open for it).
    const passwordHash = await hashPassword(body.adminPassword);

    // School + admin created in ONE transaction: if the admin insert loses a
    // race on the unique lower(email) index, everything rolls back — no orphan
    // school squatting the SIRET forever with no account able to log into it.
    let school: School;
    try {
      school = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(schools)
          .values({
            name: body.name,
            siret: body.siret,
            uai: body.uai ?? null,
            city: body.city ?? null,
            contactEmail: body.contactEmail,
            status: "pending",
          })
          .returning();
        if (!row) throw fail.internal();
        await tx.insert(schoolAdmins).values({
          schoolId: row.id,
          email: body.adminEmail,
          passwordHash,
          fullName: body.adminFullName ?? null,
        });
        return row;
      });
    } catch (e) {
      // Lost a race: map the violated index to the right user-facing 409.
      if (isUniqueViolation(e)) {
        throw violatedConstraint(e).includes("admins")
          ? fail.conflict("Un compte existe déjà pour cet e-mail")
          : fail.conflict("Un établissement est déjà enregistré avec ce SIRET.");
      }
      throw e;
    }

    await recordAudit({
      type: "school_registered",
      schoolId: school.id,
      anonymizedSubject: anonymizeIp(clientIp(c)),
      ipHash: anonymizeIp(clientIp(c)),
      userAgent: shortUserAgent(c),
    });

    // ── Validation : SIRENE (vérité officielle) d'abord, IA en vérificateur ──
    // Coût minimal : on n'appelle Gemini QUE lorsque SIRENE confirme l'existence.
    // Si SIRENE tranche (introuvable/fermé), aucun appel IA. Jamais bloquant.
    let status: "pending" | "provisional" = "pending";
    try {
      const outcome = await computeSchoolValidation({
        name: body.name,
        siret: body.siret,
        uai: body.uai ?? null,
        city: body.city ?? null,
        contactEmail: body.contactEmail,
        adminEmail: body.adminEmail,
      });

      await db
        .update(schools)
        .set({
          validationScore: outcome.score,
          validationReasoning: outcome.reasoning || null,
          validationModel: outcome.model,
          validatedAt: new Date(),
          sireneVerified: outcome.sireneVerified,
          sireneLegalName: outcome.sireneLegalName,
          sirenePostalCode: outcome.sirenePostalCode,
          sireneCity: outcome.sireneCity,
          verifiedOfficialDomain: outcome.verifiedOfficialDomain,
          validationSignals: outcome.signals,
        })
        .where(eq(schools.id, school.id));

      // Auto-validation gate (shared with the admin "re-evaluate" action): a fresh
      // `pending` school that is SIRENE-verified and scores ≥ the threshold flips to
      // `provisional`. Existence confirmed only — it must still prove CONTROL
      // (DNS / postal / ProConnect) before any PKI keys are issued (verify.md).
      const provisional = await maybeAutoValidate(school, outcome);
      if (provisional) {
        status = "provisional";
        void sendProvisionalInvite(provisional).catch((e) =>
          logger.error("school.invite_failed", { error: String(e), schoolId: school.id }),
        );
      } else {
        const adminUrl = `${env.ADMIN_ORIGIN}/schools/${school.id}`;
        void sendSchoolReviewNotification(env.ADMIN_NOTIFY_EMAIL, {
          schoolName: school.name,
          score: outcome.score,
          summary: outcome.reasoning,
          adminUrl,
        }).catch((e) => logger.error("school.notify_failed", { error: String(e) }));
      }
    } catch (e) {
      logger.error("school.validation_failed", { error: String(e), schoolId: school.id });
    }

    return c.json({ schoolId: school.id, status }, 201);
  },
  )

/** POST /schools/waitlist — landing-page pilot waitlist (public, no account).
    The prospect's email is forwarded to the team inbox — the landing promises a
    callback within 24h, so losing the lead silently is not an option. */
  .post(
  "/waitlist",
  rateLimit({ key: "waitlist", ...RATE_LIMIT.WAITLIST_IP }),
  zValidator("json", WaitlistSchema),
  async (c) => {
    const { email } = c.req.valid("json");
    // Mail failures are logged by the mailer, never thrown — always answer ok
    // (the lead is also visible in the API logs via mail.sent/mail.dropped).
    await sendWaitlistNotification(env.ADMIN_NOTIFY_EMAIL, email);
    return c.json({ ok: true });
  },
  )

/** GET /schools/me — the authenticated school's profile. */
  .get("/me", requireAuth("school_admin"), async (c) => {
  const { schoolId } = getAuth(c);
  if (!schoolId) throw fail.forbidden();

  const school = await getSchoolById(schoolId);
  if (!school) throw fail.notFound("Établissement introuvable");

  return c.json(toSchoolDTO(school));
  })

/** GET /schools/me/stats — issuance + verification stats. */
  .get("/me/stats", requireAuth("school_admin"), async (c) => {
  const { schoolId } = getAuth(c);
  if (!schoolId) throw fail.forbidden();

  const stats = await getSchoolStats(schoolId);
  return c.json(stats);
  })

/** POST /schools/me/activate — DEV self-service approval (provisions issuer keys). */
  .post(
  "/me/activate",
  requireAuth("school_admin"),
  csrfProtect(),
  async (c) => {
    // Dev-only self-service. In production, approval goes through the admin
    // portal (POST /admin/schools/:id/approve) — both share approveSchool().
    if (!env.isDev) throw fail.forbidden("Activation libre indisponible");

    const { schoolId } = getAuth(c);
    if (!schoolId) throw fail.forbidden();

    const updated = await approveSchool(schoolId);

    await recordAudit({
      type: "school_approved",
      schoolId,
      anonymizedSubject: anonymizeIp(clientIp(c)),
      ipHash: anonymizeIp(clientIp(c)),
      userAgent: shortUserAgent(c),
    });

    return c.json(toSchoolDTO(updated));
  },
  )

/** GET /schools/journal — the school's own transparency journal (paginated). */
  .get(
  "/journal",
  requireAuth("school_admin"),
  zValidator("query", ListJournalQuerySchema),
  async (c) => {
    const { schoolId } = getAuth(c);
    if (!schoolId) throw fail.forbidden();
    return c.json(await getSchoolJournal(schoolId, c.req.valid("query")));
  },
  )

/** POST /schools/journal/report — flag an issuance the school did not make.
    Freezes further issuance until a platform admin unfreezes (v2.md §V3-6). */
  .post(
  "/journal/report",
  requireAuth("school_admin"),
  csrfProtect(),
  zValidator("json", ReportJournalEntrySchema),
  async (c) => {
    const { schoolId } = getAuth(c);
    if (!schoolId) throw fail.forbidden();
    const { diplomaId, reason } = c.req.valid("json");
    return c.json(await reportJournalEntry(schoolId, diplomaId, reason));
  },
  )
