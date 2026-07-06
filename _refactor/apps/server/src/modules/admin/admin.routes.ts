import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { ADMIN_COOKIE, RATE_LIMIT } from "../../config/constants";
import {
  AdminDiplomasQuerySchema,
  ListAuditQuerySchema,
  RejectSchoolSchema,
  RevokeSchoolSchema,
  ReviewSchoolsQuerySchema,
  UpdateSettingsSchema,
} from "@certifychain/contract/schemas";
import { env } from "../../config/env";
import { db } from "../../db/client";
import { schools } from "../../db/schema";
import type { AppEnv } from "../../http/types";
import { fail } from "../../lib/http-error";
import { zValidator } from "../../lib/validator";
import { logger } from "../../lib/logger";
import { getAuth, requireAdminAuth } from "../../middleware/auth";
import { csrfProtect } from "../../middleware/csrf";
import { rateLimit } from "../../middleware/rate-limit";
import { getSchoolById, markSchoolProvisional } from "../schools/schools.service";
import { computeSchoolValidation, maybeAutoValidate } from "../schools/validation.service";
import { sendProvisionalInvite } from "../verification/verification.service";
import {
  getGlobalStats,
  getSchoolDetailForAdmin,
  listAuditGlobal,
  listDiplomasGlobal,
  listSchoolsForAdmin,
  rejectSchool,
  revokeSchool,
} from "./admin.service";
import {
  getPlatformSettings,
  toPlatformSettingsDTO,
  updatePlatformSettings,
} from "./settings.service";

const adminCsrf = csrfProtect({ cookie: ADMIN_COOKIE.CSRF });
const idParam = z.object({ id: z.string().uuid() });

export const adminRoutes = new Hono<AppEnv>()

  // Every admin route requires a valid admin session (isolated cc_admin_* realm).
  .use("*", requireAdminAuth())

  /* ── Global stats ───────────────────────────────────────────────────────── */

  .get("/stats", async (c) => c.json(await getGlobalStats()))

/* ── Schools: list / detail / lifecycle ───────────────────────────────────── */

  .get("/schools", zValidator("query", ReviewSchoolsQuerySchema), async (c) =>
  c.json(await listSchoolsForAdmin(c.req.valid("query"))),
  )

  .get("/schools/:id", zValidator("param", idParam), async (c) =>
  c.json(await getSchoolDetailForAdmin(c.req.valid("param").id)),
  )

// "Validate existence" — confirms the school is a real entity and moves it to
// `provisional`. It does NOT issue PKI keys: the school must still prove it
// CONTROLS the establishment (DNS / postal / ProConnect) to reach `approved`
// (verify.md). Keys are minted only by a successful control proof.
  .post("/schools/:id/approve", adminCsrf, zValidator("param", idParam), async (c) => {
  const { id } = c.req.valid("param");
  const school = await markSchoolProvisional(id, { reviewedByAdminId: getAuth(c).sub });
  // Only invite on a genuine transition to provisional (not on an approved no-op).
  if (school?.status === "provisional") {
    void sendProvisionalInvite(school).catch((e) =>
      logger.error("admin.invite_failed", { error: String(e), schoolId: id }),
    );
  }
  return c.json(await getSchoolDetailForAdmin(id));
  })

  .post(
  "/schools/:id/reject",
  adminCsrf,
  zValidator("param", idParam),
  zValidator("json", RejectSchoolSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    await rejectSchool(id, c.req.valid("json").reason, getAuth(c).sub);
    return c.json(await getSchoolDetailForAdmin(id));
  },
  )

  .post(
  "/schools/:id/revoke",
  adminCsrf,
  zValidator("param", idParam),
  zValidator("json", RevokeSchoolSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    await revokeSchool(id, c.req.valid("json").reason, getAuth(c).sub);
    return c.json(await getSchoolDetailForAdmin(id));
  },
  )

/** Manually re-run the AI legitimacy scoring on a school. */
  .post(
  "/schools/:id/revalidate",
  adminCsrf,
  rateLimit({ key: "admin_revalidate", ...RATE_LIMIT.ADMIN_REVALIDATE_IP }),
  zValidator("param", idParam),
  async (c) => {
    const { id } = c.req.valid("param");
    const school = await getSchoolById(id);
    if (!school) throw fail.notFound("Établissement introuvable");

    // Full re-validation (SIRENE source of truth + AI cross-check), same as the
    // registration flow, so the signals/reasoning stay consistent everywhere.
    const outcome = await computeSchoolValidation({
      name: school.name,
      siret: school.siret,
      uai: school.uai,
      city: school.city,
      contactEmail: school.contactEmail,
    });

    // Surface the failure instead of returning a silent 200 with no score: the
    // admin asked for a re-score, so "no score at all" (AI down AND no SIRENE
    // signal) is an error here.
    if (outcome.score === null) {
      throw fail.serviceUnavailable(
        env.geminiConfigured
          ? "Évaluation IA momentanément indisponible (quota dépassé ou erreur du fournisseur). Réessayez plus tard."
          : "Évaluation IA non configurée (clé Gemini absente). Revue manuelle requise.",
      );
    }

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
      .where(eq(schools.id, id));

    // Same auto-validation gate as registration: if the setting is on and this
    // re-score qualifies a still-`pending` school (SIRENE-verified + score ≥ seuil),
    // flip it to `provisional` and send the ownership-proof invite. No-ops for
    // schools an admin already actioned.
    const provisional = await maybeAutoValidate(school, outcome);
    if (provisional) {
      void sendProvisionalInvite(provisional).catch((e) =>
        logger.error("admin.invite_failed", { error: String(e), schoolId: id }),
      );
    }

    return c.json(await getSchoolDetailForAdmin(id));
  },
  )

/* ── Diplomas oversight (read-only, all schools) ──────────────────────────── */

  .get("/diplomas", zValidator("query", AdminDiplomasQuerySchema), async (c) =>
  c.json(await listDiplomasGlobal(c.req.valid("query"))),
  )

/* ── Global audit log ─────────────────────────────────────────────────────── */

  .get("/audit", zValidator("query", ListAuditQuerySchema), async (c) =>
  c.json(await listAuditGlobal(c.req.valid("query"))),
  )

/* ── Platform settings (AI auto-validation toggle + threshold) ────────────── */

  .get("/settings", async (c) =>
  c.json(toPlatformSettingsDTO(await getPlatformSettings())),
  )

  .put("/settings", adminCsrf, zValidator("json", UpdateSettingsSchema), async (c) => {
  const updated = await updatePlatformSettings(c.req.valid("json"), getAuth(c).sub);
  return c.json(toPlatformSettingsDTO(updated));
  })
