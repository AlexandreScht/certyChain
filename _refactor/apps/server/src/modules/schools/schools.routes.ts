import { zValidator } from "../../lib/validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { RATE_LIMIT } from "../../config/constants";
import { env } from "../../config/env";
import { RegisterSchoolSchema } from "@certifychain/contract/schemas";
import { db } from "../../db/client";
import { type School, schoolAdmins, schools } from "../../db/schema";
import type { AppEnv } from "../../http/types";
import { fail } from "../../lib/http-error";
import { logger } from "../../lib/logger";
import { sendSchoolReviewNotification } from "../../lib/mailer";
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

/** Postgres unique-constraint violation (e.g. two schools racing on one SIRET). */
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: unknown }).code === "23505"
  );
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

    let school: School;
    try {
      const [row] = await db
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
      school = row;
    } catch (e) {
      // Lost the race: another registration inserted this SIRET first.
      if (isUniqueViolation(e)) {
        throw fail.conflict("Un établissement est déjà enregistré avec ce SIRET.");
      }
      throw e;
    }

    await db.insert(schoolAdmins).values({
      schoolId: school.id,
      email: body.adminEmail,
      passwordHash: await hashPassword(body.adminPassword),
      fullName: body.adminFullName ?? null,
    });

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
